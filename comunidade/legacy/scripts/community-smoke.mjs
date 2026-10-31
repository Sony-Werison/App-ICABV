import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:5173';let cookie='',db,original,checks=0;const ids=[],tag='qa-community-'+randomUUID();
function check(value,label){assert.ok(value,label);checks++;}
async function call(route,method='GET',body,status=200){const r=await fetch(base+route,{method,headers:{origin:base,...(cookie?{cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),d=await r.json();assert.equal(r.status,status,`${route}: ${JSON.stringify(d)}`);checks++;return d;}
async function add(kind,data){const d=await call('/api/records','POST',{kind,data},201);ids.push(d.id);return d.id;}
function actor(role,active=1){db.prepare('UPDATE church_access SET role=?,ministry=?,active=? WHERE user_id=?').run(role,role==='leader'?'Louvor':'',active,'local_seedy');}
try{
 await call('/api/prayers','POST',{requestId:randomUUID(),title:'x',body:'x'},401);
 const sign=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');await call('/api/records');
 const dir=path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite')){const candidate=new DatabaseSync(path.join(dir,file));if(candidate.prepare("SELECT name FROM sqlite_master WHERE name='church_access'").get()){db=candidate;break;}candidate.close();}assert.ok(db);db.exec('PRAGMA busy_timeout=5000');original=db.prepare('SELECT * FROM church_access WHERE user_id=?').get('local_seedy');assert.equal(original.role,'admin');
 const content={title:tag,type:'Devocional',body:'Texto original de teste, sem material do APK.',reference:'Salmo 23',speaker:'Equipe de teste',url:'',date:'2026-10-21',status:'Publicado'};
 const published=await add('content',content),draft=await add('content',{...content,title:tag+'-draft',status:'Rascunho'});
 const cell={title:tag,leader:'Liderança fictícia',weekday:'Quarta-feira',time:'20:00',location:'Região de teste',description:'Grupo de teste',contactUrl:'https://example.com/contato',status:'Publicado'};
 const visibleCell=await add('cell',cell),hiddenCell=await add('cell',{...cell,status:'Rascunho'});
 await call('/api/records','POST',{kind:'content',data:{...content,url:'javascript:alert(1)'}},400);
 await call('/api/records','POST',{kind:'cell',data:{...cell,contactUrl:'https://user:secret@example.com'}},400);
 const privateId=randomUUID(),now=new Date().toISOString();ids.push(privateId);const privatePrayer={title:tag+'-private',body:'Pedido fictício de outra pessoa',date:'2026-10-21',status:'Aberto',authorId:'qa-foreign-person',authorName:'Outra pessoa fictícia'};
 db.prepare('INSERT INTO church_records (id,owner,kind,payload,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(privateId,'local_seedy','prayer',JSON.stringify(privatePrayer),1,now,now);
 let mobile=await call('/api/mobile');check(!mobile.items.some(i=>[draft,hiddenCell,privateId].includes(i.id)),'App do administrador não expõe rascunhos nem pedidos de outros');
 actor('secretary');let rows=await call('/api/records');check(rows.items.some(i=>i.id===privateId)&&rows.items.some(i=>i.id===draft),'Secretaria acompanha pedidos e rascunhos');
 await call('/api/records','POST',{kind:'prayer',id:privateId,version:1,data:{...privatePrayer,status:'Em oração',authorId:'forjado',authorName:'Forjado'}});
 const persisted=JSON.parse(db.prepare('SELECT payload FROM church_records WHERE id=?').get(privateId).payload);check(persisted.authorId==='qa-foreign-person'&&persisted.authorName===privatePrayer.authorName,'Autoria preservada no acompanhamento');
 actor('leader');rows=await call('/api/records');check(!rows.items.some(i=>[draft,hiddenCell,privateId].includes(i.id)),'Líder não lê rascunhos nem pedidos de outros');await call('/api/records','POST',{kind:'content',data:content},403);await call('/api/prayers','PATCH',{id:privateId,version:2},403);
 actor('treasurer');rows=await call('/api/records');check(!rows.items.some(i=>i.id===privateId),'Tesouraria não lê pedidos de outras pessoas');
 actor('member');mobile=await call('/api/mobile');check(mobile.items.some(i=>i.id===published)&&mobile.items.some(i=>i.id===visibleCell),'Conteúdos e células publicados acessíveis');check(!mobile.items.some(i=>[draft,hiddenCell,privateId].includes(i.id)),'Rascunhos e pedidos privados protegidos');
 const requestId=randomUUID();ids.push(requestId);const request={requestId,title:tag+'-meu-pedido',body:'Pedido privado fictício'};
 await call('/api/prayers','POST',{...request,authorId:'forjado'},400);
 await call('/api/prayers','POST',{...request,body:''},400);
 await call('/api/prayers','POST',request,201);await call('/api/prayers','POST',request,200);
 const own=JSON.parse(db.prepare('SELECT payload FROM church_records WHERE id=?').get(requestId).payload);check(own.authorId==='local_seedy'&&own.status==='Aberto','Autoria e situação definidas pelo servidor');check(db.prepare('SELECT count(*) AS n FROM church_records WHERE id=?').get(requestId).n===1,'Reenvio não duplica pedidos');
 mobile=await call('/api/mobile');check(mobile.items.some(i=>i.id===requestId)&&!mobile.items.some(i=>i.id===privateId),'Pessoa recebe apenas seus próprios pedidos');
 await call('/api/prayers','PATCH',{id:requestId,version:1});await call('/api/prayers','PATCH',{id:requestId,version:1},409);await call('/api/records','DELETE',{id:privateId,version:2},403);
 actor('member',0);await call('/api/prayers','POST',{...request,requestId:randomUUID()},403);
 console.log(`OK: ${checks} verificações de conteúdo, células, links seguros, pedidos privados, autoria e reenvio.`);
}finally{if(db){if(original)db.prepare('UPDATE church_access SET role=?,ministry=?,active=? WHERE user_id=?').run(original.role,original.ministry,original.active,'local_seedy');for(const id of ids.reverse())db.prepare('DELETE FROM church_records WHERE id=?').run(id);db.close();}}
