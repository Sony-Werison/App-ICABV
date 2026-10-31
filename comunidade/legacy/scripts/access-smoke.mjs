import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
const base='http://127.0.0.1:5173';let cookie='',checks=0,db,original;const ids=[],inviteIds=[];const tag='qa-'+randomUUID();
function check(v,message){assert.ok(v,message);checks++;}
async function call(route,method='GET',body,status=200){const r=await fetch(base+route,{method,headers:{origin:base,...(cookie?{cookie}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,`${method} ${route}: ${JSON.stringify(data)}`);checks++;return data;}
async function add(kind,data){const x=await call('/api/records','POST',{kind,data},201);ids.push(x.id);return x.id;}
function actor(role,extra={}){db.prepare('UPDATE church_access SET role=?,ministry=?,member_id=?,active=? WHERE user_id=?').run(role,extra.ministry||'',extra.memberId||null,extra.active===false?0:1,'local_seedy');}
function inviteFixture(extra={}){const id=randomUUID(),token=randomBytes(32).toString('hex'),now=new Date().toISOString();db.prepare('INSERT INTO church_invitations (id,church_owner,email,role,ministry,member_id,token_hash,expires_at,created_at,revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,'local_seedy','seedy@sites.test','member','',extra.memberId||null,createHash('sha256').update(token).digest('hex'),extra.expired?'2000-01-01T00:00:00Z':'2099-01-01T00:00:00Z',now,extra.revoked?now:null);inviteIds.push(id);return token;}
try{
 await call('/api/mobile','GET',undefined,401);
 const sign=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});cookie=sign.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');check(cookie,'Cookie local');
 await call('/api/records');
 const dir=path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite')){const candidate=new DatabaseSync(path.join(dir,file));if(candidate.prepare("SELECT name FROM sqlite_master WHERE name='church_access'").get()){db=candidate;break;}candidate.close();}
 check(db,'Banco local encontrado');db.exec('PRAGMA busy_timeout=5000');original=db.prepare('SELECT * FROM church_access WHERE user_id=?').get('local_seedy');check(original?.role==='admin','Admin local inicial');
 const member={name:tag,email:'qa@example.test',phone:'123',status:'Membro',ministry:'Louvor',birthday:'2000-01-01',notes:'Observação privada de teste'};
 const ma=await add('member',member),mb=await add('member',{...member,name:tag+'-outro',ministry:'Infantil'});
 const ev=await add('event',{title:tag,date:'2099-12-20',time:'19:00',location:'Templo',capacity:100,status:'Confirmado',notes:'Nota administrativa'});
 await add('transaction',{description:tag,direction:'Entrada',amount:10001,category:'Ofertas',date:'2099-12-20',status:'Realizado',notes:''});
 const published=await add('notice',{title:tag,body:'Recado público de teste',date:'2099-12-20',status:'Publicado'}),draft=await add('notice',{title:tag+'-rascunho',body:'Rascunho interno',date:'2099-12-20',status:'Rascunho'});
 const schedule={ministry:'Louvor',duty:'Vocal',memberId:ma,eventId:ev,date:'2099-12-20',time:'19:00',status:'Pendente',notes:'Anotação interna'};
 const sa=await add('schedule',schedule),sb=await add('schedule',{...schedule,memberId:mb,ministry:'Infantil'});
 await call('/api/team','PATCH',{action:'link-self',version:original.version,memberId:ma});
 check(db.prepare('SELECT role,member_id FROM church_access WHERE user_id=?').get('local_seedy').role==='admin','Vínculo próprio preserva o administrador');
 await call('/api/team','PATCH',{action:'link-self',version:original.version+1,memberId:null});
 const newInvite=await call('/api/team','POST',{email:tag+'@example.test',role:'leader',ministry:'Louvor',memberId:null},201);
 const stored=db.prepare('SELECT * FROM church_invitations WHERE email=?').get(tag+'@example.test');inviteIds.push(stored.id);check(stored.token_hash===createHash('sha256').update(newInvite.token).digest('hex'),'Token armazenado apenas como hash');
 const team=await call('/api/team');check(!JSON.stringify(team).includes(newInvite.token)&&!JSON.stringify(team).includes(stored.token_hash),'Listagem não expõe tokens');
 await call('/api/invitations/accept','POST',{token:'invalid'},400);
 actor('secretary');let list=await call('/api/records');check(list.items.some(i=>i.id===ma)&&!list.items.some(i=>i.kind==='transaction'),'Secretaria sem finanças');await call('/api/records','POST',{kind:'transaction',data:{description:tag,direction:'Entrada',amount:100,category:'x',date:'2099-12-20',status:'Realizado',notes:''}},403);await call('/api/team','GET',undefined,403);
 actor('treasurer');list=await call('/api/records');check(list.items.some(i=>i.kind==='transaction')&&!list.items.some(i=>['member','schedule'].includes(i.kind)),'Tesouraria sem cadastro e escalas');await call('/api/records','POST',{kind:'member',data:member},403);let mobile=await call('/api/mobile');check(!mobile.items.some(i=>['transaction','member'].includes(i.kind))&&!mobile.items.some(i=>i.id===draft),'App não recebe finanças, cadastros ou rascunhos');
 actor('leader',{ministry:'Louvor',memberId:ma});list=await call('/api/records');check(list.items.some(i=>i.id===ma)&&!list.items.some(i=>i.id===mb||i.id===sb||i.kind==='transaction'),'Líder limitado ao ministério');check(!('notes' in list.items.find(i=>i.id===ma).data)&&!('email' in list.items.find(i=>i.id===ma).data),'Cadastro projetado sem dados privados');await call('/api/records','POST',{kind:'schedule',data:{...schedule,memberId:mb,ministry:'Infantil',time:'20:00'}},403);await call('/api/records','DELETE',{id:sb,version:1},403);await call('/api/records','POST',{kind:'schedule',data:{...schedule,memberId:mb,time:'20:00'}},403);
 const leaderScale=await add('schedule',{...schedule,time:'20:00'});await call('/api/team','GET',undefined,403);
 actor('member',{memberId:ma});list=await call('/api/records');check(!list.items.some(i=>i.id===mb||i.id===sb||i.id===draft||i.kind==='transaction'),'Membro somente dados autorizados');mobile=await call('/api/mobile');check(mobile.items.some(i=>i.id===sa)&&!mobile.items.some(i=>i.id===sb||i.id===draft),'Escalas pessoais no app');await call('/api/records','POST',{kind:'member',data:member},403);await call('/api/my-schedule','PATCH',{id:sb,version:1,status:'Confirmado'},403);await call('/api/my-schedule','PATCH',{id:sa,version:1,status:'Confirmado'});await call('/api/my-schedule','PATCH',{id:sa,version:1,status:'Indisponível'},409);
 const web=await fetch(base+'/gestao',{headers:{cookie},redirect:'manual'});check(web.status>=300&&web.status<400&&web.headers.get('location')?.includes('/app'),'Membro redirecionado ao app');
 actor('member',{memberId:ma,active:false});await call('/api/records','GET',undefined,403);await call('/api/mobile','GET',undefined,403);await call('/api/my-schedule','PATCH',{id:sa,version:2,status:'Indisponível'},403);
 actor('admin');await call('/api/team','PATCH',{action:'revoke-invite',id:stored.id});check(db.prepare('SELECT revoked_at FROM church_invitations WHERE id=?').get(stored.id).revoked_at,'Revogação persistida');
 const fixtureUser=tag+'-access';db.prepare('INSERT INTO church_access (user_id,church_owner,email,name,role,ministry,active,version,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(fixtureUser,'local_seedy',tag+'@example.test','Acesso fictício','secretary','',1,1,new Date().toISOString());
 try{
  await call('/api/team','PATCH',{action:'update-access',userId:fixtureUser,version:1,active:true,role:'treasurer',ministry:'',memberId:null});
  check(db.prepare('SELECT role FROM church_access WHERE user_id=?').get(fixtureUser).role==='treasurer','Alteração de perfil persistida');
  await call('/api/team','PATCH',{action:'update-access',userId:fixtureUser,version:1,active:true,role:'secretary',ministry:'',memberId:null},409);
  await call('/api/team','PATCH',{action:'update-access',userId:fixtureUser,version:2,active:false,role:'treasurer',ministry:'',memberId:null});
  check(db.prepare('SELECT active FROM church_access WHERE user_id=?').get(fixtureUser).active===0,'Suspensão pela API');
  await call('/api/team','PATCH',{action:'update-access',userId:fixtureUser,version:3,active:true,role:'admin',ministry:'',memberId:null},400);
  await call('/api/team','PATCH',{action:'update-access',userId:'local_seedy',version:1,active:false,role:'member',ministry:'',memberId:mb},403);
 }finally{db.prepare('DELETE FROM church_access WHERE user_id=?').run(fixtureUser);}
 const manifest=await (await fetch(base+'/manifest.webmanifest')).json();check(manifest.start_url==='/app'&&manifest.display==='standalone','Manifesto PWA');for(const icon of manifest.icons){const r=await fetch(base+icon.src);check(r.ok&&r.headers.get('content-type').includes('image/png'),'Ícone instalável');}
 const sw=await (await fetch(base+'/sw.js')).text();check(!sw.includes('cache.put')&&!sw.includes("cache.add('/api"),'Sem cache de dados privados');
 // Only local fixture identities are changed; restore the original administrator below.
 db.prepare('DELETE FROM church_access WHERE user_id=?').run('local_seedy');
 const expired=inviteFixture({expired:true,memberId:ma}),revoked=inviteFixture({revoked:true,memberId:ma});
 await call('/api/invitations/accept','POST',{token:expired},403);await call('/api/invitations/accept','POST',{token:revoked},403);await call('/api/invitations/accept','POST',{token:newInvite.token},403);
 const good=inviteFixture({memberId:ma});await call('/api/invitations/accept','POST',{token:good});check(db.prepare('SELECT role,member_id FROM church_access WHERE user_id=?').get('local_seedy').member_id===ma,'Convite cria vínculo compartilhado correto');await call('/api/invitations/accept','POST',{token:good},409);
 console.log(`OK: ${checks} verificações de permissões, privacidade, convites, suspensão, escalas pessoais e recursos PWA.`);
}finally{
 if(db){db.prepare('DELETE FROM church_access WHERE user_id=?').run('local_seedy');if(original){const keys=Object.keys(original);db.prepare(`INSERT INTO church_access (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(original));}for(const id of inviteIds)db.prepare('DELETE FROM church_invitations WHERE id=?').run(id);for(const id of ids.reverse())db.prepare('DELETE FROM church_records WHERE id=?').run(id);db.close();}
}
