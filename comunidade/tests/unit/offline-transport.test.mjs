import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const compile=file=>ts.transpileModule(readFileSync(new URL('../../features/icabv/'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const uri=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const source=compile('offline-transport.ts').replace('"./offline-rpcs"',JSON.stringify(uri(compile('offline-rpcs.ts')))).replace('"./offline-store"',JSON.stringify(uri(compile('offline-store.ts'))));
const {OfflineTransport}=await import(uri(source));
class Store {
 changes=[];reads=new Map();ids=new Map();sequence=0;
 async list(user,project){return structuredClone(this.changes.filter(c=>c.user===user&&c.project===project).sort((a,b)=>a.key-b.key));}
 async add(change){const c={...structuredClone(change),key:++this.sequence};this.changes.push(c);return structuredClone(c);}
 async put(change){this.changes[this.changes.findIndex(c=>c.key===change.key)]=structuredClone(change);}
 async remove(key){this.changes=this.changes.filter(c=>c.key!==key);}
 async read(key){return this.reads.get(key);}
 async cache(value){this.reads.set(value.key,structuredClone(value));}
 async mappings(user,project){return this.ids.get(project+user)||{};}
 async map(user,project,values){this.ids.set(project+user,{...await this.mappings(user,project),...values});}
}
const user='60000000-0000-4000-8000-000000000001',other='60000000-0000-4000-8000-000000000002',project='https://example.supabase.co';
const jwt=id=>'header.'+Buffer.from(JSON.stringify({sub:id})).toString('base64url')+'.signature';
const headers=id=>({Authorization:'Bearer '+jwt(id),'Content-Type':'application/json'});
function setup(){let online=true,session={user,token:jwt(user)},handler=async()=>Response.json([]);const store=new Store();const env={online:()=>online,now:Date.now,uuid:()=>crypto.randomUUID(),fetch:(...args)=>handler(...args),session:async()=>session,changed:()=>{}};const engine=new OfflineTransport(project,store,env);return {store,engine,env,online:v=>online=v,session:v=>session=v,handler:v=>handler=v};}
test('chamada offline persiste, reaparece nas leituras e é enviada por ordem após reabrir',async()=>{
 const x=setup(),url=project+'/rest/v1/ebd_attendance?class_id=eq.c1&order=lesson_date,id';
 x.handler(async()=>Response.json([{id:'a1',class_id:'c1',person_id:'p1',present:false}]));await x.engine.request(url,{headers:headers(user)});
 x.online(false);
 const response=await x.engine.request(project+'/rest/v1/ebd_attendance?on_conflict=class_id,person_id,lesson_date',{method:'POST',headers:{...headers(user),Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:'a1',class_id:'c1',person_id:'p1',present:true})});assert.equal(response.status,202);assert.equal(x.store.changes.length,1);
 const offline=await x.engine.request(url,{headers:headers(user)});assert.equal((await offline.json())[0].present,true);
 const reopened=new OfflineTransport(project,x.store,x.env);assert.equal((await reopened.pending(user)).length,1);
 const sent=[];x.online(true);x.handler(async(url,init)=>{sent.push(JSON.parse(init.body));return Response.json([{id:'a1',present:true}]);});await reopened.flush(user);
 assert.equal(sent.length,1);assert.equal(sent[0].command.body.present,true);assert.equal((await reopened.pending(user)).length,0);
});
test('resposta perdida repete a mesma operação e conflitos ficam preservados para revisão',async()=>{
 const x=setup();let first;const commands=[];
 x.handler(async(url,init)=>{const p=JSON.parse(init.body);commands.push(p);if(!first){first=p;throw new TypeError('Network lost after commit');}return Response.json('server-id');});
 const r=await x.engine.request(project+'/rest/v1/rpc/create_family',{method:'POST',headers:headers(user),body:JSON.stringify({family_name:'Família offline'})});assert.equal(r.status,202);assert.equal(x.store.changes.length,1);
 await x.engine.flush(user);assert.deepEqual(commands[0],commands[1]);assert.equal(x.store.changes.length,0);
 x.handler(async()=>Response.json({message:'version_conflict',code:'P0001'},{status:400}));
 const failed=await x.engine.request(project+'/rest/v1/rpc/save_management_record',{method:'POST',headers:headers(user),body:JSON.stringify({resource:'id',record_kind:'notice',payload:{},expected_version:1})});assert.equal(failed.status,400);assert.equal(x.store.changes[0].state,'review');assert.match(x.store.changes[0].error,/registro mudou/);
});
test('a fila não usa a sessão de outra conta nem entrega o cache privado para ela',async()=>{
 const x=setup(),url=project+'/rest/v1/persons?select=id,full_name';x.handler(async()=>Response.json([{id:'private-person',full_name:'Cadastro privado'}]));await x.engine.request(url,{headers:headers(user)});
 x.online(false);await x.engine.request(project+'/rest/v1/rpc/create_family',{method:'POST',headers:headers(user),body:JSON.stringify({family_name:'Minha família'})});
 await assert.rejects(x.engine.request(url,{headers:headers(other)}),/Sem conexão/);
 let sent=0;x.handler(async()=>{sent++;return Response.json('id');});x.online(true);x.session({user:other,token:jwt(other)});await x.engine.flush(user);assert.equal(sent,0);assert.equal((await x.engine.pending(other)).length,0);assert.equal((await x.engine.pending(user)).length,1);
});
test('dependências recebem os IDs do servidor antes do envio seguinte',async()=>{
 const x=setup();x.online(false);
 const created=await x.engine.request(project+'/rest/v1/rpc/register_person',{method:'POST',headers:headers(user),body:JSON.stringify({display_name:'Pessoa offline'})});const temporary=await created.json();
 await x.engine.request(project+'/rest/v1/ebd_class_members',{method:'POST',headers:headers(user),body:JSON.stringify({class_id:'c1',person_id:temporary,role:'student'})});
 const serverId='60000000-0000-4000-8000-000000000099';let calls=0;
 x.online(true);x.handler(async(url,init)=>{const payload=JSON.parse(init.body);calls++;if(calls===1)return Response.json(serverId);assert.equal(payload.command.body.person_id,serverId);return Response.json([]);});await x.engine.flush(user);assert.equal(calls,2);assert.equal(x.store.changes.length,0);
});
test('falha de armazenamento impede falso sucesso e RPC de leitura não entra na fila',async()=>{
 const x=setup();x.online(false);await assert.rejects(x.engine.request(project+'/rest/v1/rpc/birthday_calendar',{method:'POST',headers:headers(user),body:'{"month_number":10}'}),/Sem conexão/);assert.equal(x.store.changes.length,0);
 x.store.add=async()=>{throw Error('Sem espaço');};await assert.rejects(x.engine.request(project+'/rest/v1/rpc/create_family',{method:'POST',headers:headers(user),body:'{"family_name":"Teste"}'}),/Sem espaço/);
});

test('revisão de identidade offline preserva a prévia e exige nova conferência se ela ficar desatualizada',async()=>{
 const x=setup();x.online(false);
 const input={source_person:'imported-id',target_person:'account-id',review_decision:'merged',review_reason:'Identidade confirmada pessoalmente.',expected_fingerprint:'preview-v1',choices:{profile:'target'}};
 const pending=await x.engine.request(project+'/rest/v1/rpc/review_identity',{method:'POST',headers:headers(user),body:JSON.stringify(input)});
 assert.equal(pending.status,202);assert.equal(x.store.changes.length,1);assert.deepEqual(x.store.changes[0].command.body,input);
 x.online(true);x.handler(async()=>Response.json({message:'identity_version_conflict',code:'P0001'},{status:400}));
 await x.engine.flush(user);assert.equal(x.store.changes[0].state,'review');assert.deepEqual(x.store.changes[0].command.body,input);assert.match(x.store.changes[0].error,/registro mudou/);
});
