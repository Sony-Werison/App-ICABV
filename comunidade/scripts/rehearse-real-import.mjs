import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder=process.env.ICABV_IMPORT_DIR||'work/real-import-20261022';
const plan=JSON.parse(readFileSync(folder+'/import-plan.json','utf8')),target=JSON.parse(readFileSync(folder+'/target-before.json','utf8'));
function stable(v){if(Array.isArray(v))return '['+v.map(x=>x===undefined?'null':stable(x)).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
const {plan_hash,...hashed}=plan;assert.equal(createHash('sha256').update(stable(hashed)).digest('hex'),plan_hash);
const db=new PGlite();const started=Date.now();
try{
 await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 for(const name of readdirSync('backend/supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync('backend/supabase/migrations/'+name,'utf8'));
 for(const u of target.auth_users)await db.query('insert into auth.users(id) values($1)',[u.id]);
 for(const p of target.persons)await db.query('update public.persons set id=$1,full_name=$2,membership_status=$3,onboarded_at=$4 where auth_user_id=$5',[p.id,p.full_name,p.membership_status,p.onboarded_at,p.auth_user_id]);
 for(const r of target.role_assignments)await db.query('insert into public.role_assignments(person_id,role,granted_by) values($1,$2,$3)',[r.person_id,r.role,r.granted_by]);
 const owner=target.persons.find(p=>p.id===plan.summary.owner_person_id);assert.ok(owner);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner.auth_user_id]);await db.exec('set role authenticated');
 console.log(JSON.stringify({stage:'rehearsal_started',plan_hash,history:plan.ebd.history.length,activities:plan.ebd.activities.length}));
 const applied=(await db.query('select public.import_reconciled_modules($1) result',[plan])).rows[0].result;assert.ok(applied.applied);console.log(JSON.stringify({stage:'rehearsal_imported',elapsed_seconds:Math.round((Date.now()-started)/1000)}));
 const tables=['persons','legacy_mapping','legacy_person_records','worship_members','worship_songs','worship_services','ebd_classes','ebd_class_members','ebd_guardians','ebd_modules','ebd_activities','ebd_legacy_history','ebd_attendance','ebd_recordings','module_import_runs'];
 async function counts(){await db.exec('reset role');const all={};for(const table of tables)all[table]=(await db.query('select count(*)::int n from public.'+table)).rows[0].n;await db.exec('set role authenticated');return all;}
 const before=await counts();assert.equal(before.ebd_legacy_history,plan.ebd.history.length);assert.equal(before.worship_songs,plan.louvor.songs.length);assert.equal(before.ebd_recordings,plan.ebd.recordings.length);
 const account=(await db.query("select p.id,p.full_name,(select count(*) from public.worship_members w where w.person_id=p.id)::int music_member,(select count(*) from public.ebd_class_members c where c.person_id=p.id and c.role='teacher')::int teaching_classes,(select count(*) from public.ebd_legacy_history h where h.teacher_id=p.id)::int teaching_records from public.persons p where p.id=$1",[owner.id])).rows[0];
 assert.equal(account.music_member,1);assert.equal(account.teaching_records,plan.summary.owner_teaching_records);assert.ok(account.teaching_classes>0);
 const repeat=(await db.query('select public.import_reconciled_modules($1) result',[plan])).rows[0].result;assert.deepEqual(repeat,applied);assert.deepEqual(await counts(),before);
 await db.exec('reset role');
 const other=target.persons.find(p=>p.id!==owner.id);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other.auth_user_id]);await db.exec('set role authenticated');
 assert.equal((await db.query('select count(*)::int n from public.ebd_legacy_history')).rows[0].n,0);
 await assert.rejects(db.query('select public.import_reconciled_modules($1)',[plan]),/forbidden/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from public.consent_events')).rows[0].n,0);
 const report={plan_hash,passed:true,counts:before,owner:account,idempotent:true,unauthorized_access_denied:true,elapsed_seconds:Math.round((Date.now()-started)/1000)};writeFileSync(folder+'/rehearsal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(JSON.stringify({passed:false,code:error.code,message:error.message,where:error.where?.slice(0,1800),internalQuery:error.internalQuery?.slice(0,1200)}));process.exitCode=1;}finally{await db.close();}
