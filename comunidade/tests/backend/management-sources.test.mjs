import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('gestão: totais oficiais completos, identidades arquivadas e situação revisada',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  const dir=new URL('../../backend/supabase/migrations/',import.meta.url);for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const admin=crypto.randomUUID(),member=crypto.randomUUID();for(const id of [admin,member])await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query("insert into public.role_assignments(person_id,role) select id,'admin' from public.persons where auth_user_id=$1",[admin]);
  const target=(await db.query("insert into public.persons(full_name) values('Álvaro Teste') returning id")).rows[0].id;
  await db.query("insert into public.persons(full_name,merged_into) values('Cadastro arquivado',$1)",[target]);
  await db.exec("insert into public.persons(full_name) select 'Pessoa '||i from generate_series(1,30) i;insert into public.events(title,starts_at,ends_at,audience,status) select 'Evento '||i,now()+interval '5 days',now()+interval '6 days','public','published' from generate_series(1,27) i;insert into public.community_units(kind,title,published) select 'group','Grupo '||i,true from generate_series(1,29) i;insert into public.community_units(kind,title,published) values('group','Rascunho',false),('department','Equipe',true);");
  const actor=async(id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec(id?'set role authenticated':'set role anon');};
  await actor(null);await assert.rejects(db.query('select public.management_summary()'),/permission denied/);
  await actor(member);const publicSummary=(await db.query('select public.management_summary() s')).rows[0].s;assert.equal(publicSummary.persons,null);await assert.rejects(db.query('select public.management_people()'),/forbidden/);
  await actor(admin);const summary=(await db.query('select public.management_summary() s')).rows[0].s;assert.equal(summary.persons,33);assert.equal(summary.event_count,27);assert.equal(summary.group_count,29);assert.equal(summary.events.length,4);
  const all=(await db.query('select public.management_people() p')).rows[0].p;assert.equal(all.total,33);assert.equal(all.items.length,25);assert.ok(!all.items.some(p=>p.full_name==='Cadastro arquivado'));
  const found=(await db.query("select public.management_people('alvaro','unreviewed',0) p")).rows[0].p;assert.equal(found.total,1);assert.equal(found.items[0].id,target);assert.equal(found.items[0].membership_status,'visitor');assert.equal(found.items[0].membership_reviewed_at,null);
  await db.query("select public.set_membership($1,'member')",[target]);const reviewed=(await db.query("select public.management_people('alvaro','member',0) p")).rows[0].p;assert.equal(reviewed.total,1);assert.ok(reviewed.items[0].membership_reviewed_at);
  assert.equal((await db.query("select public.management_people('alvaro','unreviewed',0) p")).rows[0].p.total,0);
  assert.equal((await db.query("select count(*)::int n from public.role_assignments where person_id=$1",[target])).rows[0].n,0,'Revisar situação não concede permissões');
 }finally{await db.close();}
});
