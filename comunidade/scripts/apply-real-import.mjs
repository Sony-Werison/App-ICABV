// Apply only a verified, rehearsed plan. Source systems are never modified.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const folder=process.env.ICABV_IMPORT_DIR;
assert.ok(folder,'ICABV_IMPORT_DIR is required');
const read=name=>JSON.parse(readFileSync(`${folder}/${name}.json`,'utf8'));
const stable=v=>Array.isArray(v)?'['+v.map(x=>x===undefined?'null':stable(x)).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const plan=read('import-plan'), rehearsal=read('rehearsal'),snapshot=read('snapshot-summary');
const {plan_hash,...payload}=plan;
assert.equal(hash(stable(payload)),plan_hash);
assert.equal(rehearsal.plan_hash,plan_hash);assert.equal(rehearsal.passed,true);
assert.equal(snapshot.target_ref,'ynkfmuseiancpnyloraf');
for(const source of ['louvor','ebd'])assert.equal(hash(readFileSync(`${folder}/${source}-source.json`)),plan.source_hashes[source]);
assert.equal(hash(readFileSync(`${folder}/target-before.json`)),plan.target_before_hash);
const keys=JSON.parse(execFileSync('C:/Users/perei/apps/App Igreja/node_modules/supabase/bin/supabase.exe',['projects','api-keys','--project-ref',snapshot.target_ref,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const secret=keys.find(k=>k.name==='service_role')?.api_key||keys.find(k=>k.type==='secret')?.api_key;
const publicKey=keys.find(k=>k.type==='publishable')?.api_key||keys.find(k=>k.name==='anon')?.api_key;
assert.ok(secret&&publicKey);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const service=createClient(`https://${snapshot.target_ref}.supabase.co`,secret,options);
const tables=['persons','legacy_mapping','legacy_person_records','worship_members','worship_songs','worship_services','worship_rehearsals','ebd_classes','ebd_class_members','ebd_guardians','ebd_modules','ebd_activities','ebd_legacy_history','ebd_attendance','ebd_recordings','module_import_runs'];
async function counts(){const out={};for(const table of tables){const r=await service.from(table).select('*',{count:'exact',head:true});if(r.error)throw new Error(`${table}: ${r.error.message}`);out[table]=r.count;}return out;}
const previous=await service.from('module_import_runs').select('id,plan_hash,summary').eq('id',plan.run_id).maybeSingle();
if(previous.error)throw Error(previous.error.message);
if(previous.data){assert.equal(previous.data.plan_hash,plan_hash);console.log(JSON.stringify({already_applied:true,counts:await counts()}));process.exit(0);}
const before=await counts();
for(const table of tables.filter(t=>snapshot.target_counts[t]!==undefined))assert.equal(before[table],snapshot.target_counts[table],`Target changed after snapshot: ${table}`);
assert.equal(before.module_import_runs,0,'Review existing imports before applying a new initial plan');
if(!process.argv.includes('--apply')){console.log(JSON.stringify({ready:true,plan_hash,counts:rehearsal.counts}));process.exit(0);}
// Create an isolated session for the existing verified administrator. No email is sent.
const owner=read('target-before').auth_users.find(u=>read('target-before').persons.some(p=>p.id===plan.summary.owner_person_id&&p.auth_user_id===u.id));
assert.ok(owner?.email_confirmed_at);
const link=await service.auth.admin.generateLink({type:'magiclink',email:owner.email});
if(link.error)throw Error(link.error.message);
assert.equal(link.data.user.id,owner.id);assert.ok(link.data.user.email_confirmed_at);
const actor=createClient(`https://${snapshot.target_ref}.supabase.co`,publicKey,options);
const verified=await actor.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});
if(verified.error)throw Error(verified.error.message);
assert.equal(verified.data.user.id,owner.id);
try{
 const roles=await actor.rpc('my_roles');assert.ok(!roles.error&&roles.data.includes('admin'));
 const started=Date.now();
 const applied=await actor.rpc('import_reconciled_modules',{plan});
 if(applied.error)throw Error(applied.error.message);
 assert.equal(applied.data.applied,true);
 const after=await counts();
 for(const table of ['worship_songs','worship_services','ebd_classes','ebd_modules','ebd_activities','ebd_legacy_history','ebd_attendance','ebd_recordings'])assert.equal(after[table],rehearsal.counts[table],`Verification mismatch: ${table}`);
 const repeat=await actor.rpc('import_reconciled_modules',{plan});
 if(repeat.error)throw Error(repeat.error.message);
 assert.deepEqual(repeat.data,applied.data);assert.deepEqual(await counts(),after);
 const report={applied:true,plan_hash,run_id:plan.run_id,captured_at:snapshot.captured_at,applied_at:new Date().toISOString(),before,after,idempotent:true,elapsed_seconds:Math.round((Date.now()-started)/1000)};
 writeFileSync(`${folder}/applied.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{await actor.auth.signOut({scope:'local'});}
