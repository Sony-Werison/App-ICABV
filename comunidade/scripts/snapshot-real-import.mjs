// Read-only source export. Never log or persist credentials/passwords.
import {createClient} from '@supabase/supabase-js';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const targetRef='ynkfmuseiancpnyloraf',owner='pereirawerison@gmail.com';
const folder=process.env.ICABV_IMPORT_DIR||'work/real-import-20261022';mkdirSync(folder,{recursive:true});
const sdkOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
function sanitize(v){
 if(v===null||typeof v!=='object')return v;
 if(typeof v.toDate==='function')return v.toDate().toISOString();
 if(v._firestore&&typeof v.path==='string')return v.path;
 if(Array.isArray(v))return v.map(sanitize);
 return Object.fromEntries(Object.entries(v).filter(([key])=>!/password|secret|token|private.?key/i.test(key)).map(([key,value])=>[key,sanitize(value)]));
}
function save(name,data){const serialized=JSON.stringify(data,null,2);writeFileSync(folder+'/'+name+'.json',serialized);return createHash('sha256').update(serialized).digest('hex');}
function envValues(file){const text=readFileSync(file,'utf8');const values={};for(const line of text.split(/\r?\n/)){const match=line.match(/^\s*(NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY))\s*=\s*(.*)$/);if(match)values[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');}return values;}
async function table(client,name,key='id'){const all=[];for(let offset=0;;offset+=500){const r=await client.from(name).select('*').order(key).range(offset,offset+499);if(r.error)throw new Error(name+': '+r.error.message);all.push(...r.data);if(r.data.length<500)break;}return all;}
const keys=JSON.parse(execFileSync('C:/Users/perei/apps/App Igreja/node_modules/supabase/bin/supabase.exe',['projects','api-keys','--project-ref',targetRef,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='service_role')?.api_key||keys.find(k=>k.type==='secret')?.api_key;assert.ok(secret);
const target=createClient(`https://${targetRef}.supabase.co`,secret,sdkOptions);
const targetTables=['persons','person_contacts','legacy_mapping','role_assignments','management_records','worship_members','worship_songs','worship_services','ebd_classes','ebd_class_members','ebd_guardians','ebd_modules','ebd_activities','ebd_submissions','ebd_legacy_history','ebd_attendance','ebd_recordings'];
const targetData={};for(const name of targetTables){const key=({person_contacts:'person_id',legacy_mapping:'legacy_id',role_assignments:'person_id',worship_members:'person_id',ebd_class_members:'person_id',ebd_guardians:'student_id'})[name]||'id';targetData[name]=await table(target,name,key);}
targetData.auth_users=[];for(let page=1;;page++){const r=await target.auth.admin.listUsers({page,perPage:500});assert.ok(!r.error);targetData.auth_users.push(...r.data.users.map(u=>({id:u.id,email:u.email,email_confirmed_at:u.email_confirmed_at})));if(r.data.users.length<500)break;}
const ownerUser=targetData.auth_users.find(u=>u.email?.toLowerCase()===owner);assert.ok(ownerUser?.email_confirmed_at);assert.ok(targetData.persons.some(p=>p.auth_user_id===ownerUser.id));
const summary={captured_at:new Date().toISOString(),target_ref:targetRef,target_counts:Object.fromEntries(targetTables.map(t=>[t,targetData[t].length])),target_hash:save('target-before',targetData),sources:{}};
try{
 const env=envValues('C:/Users/perei/apps/App Igreja/Louvor ICABV/.env.local');assert.ok(env.NEXT_PUBLIC_SUPABASE_URL&&env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 assert.notEqual(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,`${targetRef}.supabase.co`);
 const music=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,sdkOptions),data={};
 for(const name of ['members','songs','monthly_schedules','rehearsal'])data[name]=sanitize(await table(music,name));
 summary.sources.louvor={status:'live',host:new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),sha256:save('louvor-source',data)};
}catch(e){summary.sources.louvor={status:'error',message:String(e.message).slice(0,300)};}
let app;
try{
 const root='C:/Users/perei/apps/App Igreja/Portal-do-aluno-EBD',require=createRequire(root+'/package.json');
 const {initializeApp,cert,deleteApp}=require('firebase-admin/app');const {getFirestore,FieldPath}=require('firebase-admin/firestore');
 const credentials=JSON.parse(readFileSync(root+'/firebase-service-account.json','utf8'));assert.equal(credentials.project_id,'studio-7878039128-bacd5');
 app=initializeApp({credential:cert(credentials),projectId:credentials.project_id},'icabv-readonly-export');const firestore=getFirestore(app);firestore.settings({preferRest:true});
 const data={};for(const name of ['profiles','classes','submissions','curriculum','bibleActivities','videoActivities','quizActivities','videoBibleActivities','classRecordings','settings']){
  const rows=[];let last;for(;;){let query=firestore.collection(name).orderBy(FieldPath.documentId()).limit(500);if(last)query=query.startAfter(last);const batch=await query.get();rows.push(...batch.docs.map(doc=>({...sanitize(doc.data()),id:doc.id})));if(batch.size<500)break;last=batch.docs.at(-1);}data[name]=name==='curriculum'?Object.fromEntries(rows.map(r=>[r.id,r])):rows;
 }
 summary.sources.ebd={status:'live',project_id:credentials.project_id,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?v.length:Object.keys(v).length])),sha256:save('ebd-source',data)};
 await deleteApp(app);app=null;
}catch(e){summary.sources.ebd={status:'error',message:String(e.message).slice(0,300)};if(app){try{const require=createRequire('C:/Users/perei/apps/App Igreja/Portal-do-aluno-EBD/package.json');await require('firebase-admin/app').deleteApp(app);}catch{}}}
save('snapshot-summary',summary);console.log(JSON.stringify(summary,null,2));
