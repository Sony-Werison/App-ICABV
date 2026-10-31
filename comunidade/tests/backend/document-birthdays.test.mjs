import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Document birthdays: authenticated directory, no birth years, deduplication and later profile choice',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  const dir=new URL('../../backend/supabase/migrations/',import.meta.url);
  for(const file of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,dir),'utf8'));
  const uid='91000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users(id) values($1)',[uid]);
  const pid=(await db.query('select id from public.persons where auth_user_id=$1',[uid])).rows[0].id;
  await db.query("update public.persons set full_name='Pessoa Confirmada' where id=$1",[pid]);
  await db.query("insert into public.person_contacts(person_id,birth_date) values($1,'1992-02-29')",[pid]);
  const insert="insert into public.document_birthdays(id,display_name,birth_day,birth_month,person_id,source_sha256,source_name,source_rows) values(gen_random_uuid(),$1,$2,$3,$4,repeat('a',64),'Fonte teste.pdf','[]')";
  await assert.rejects(db.query(insert,['Data inválida',30,2,null]));
  await db.query(insert,['Nome preservado',29,2,pid]);
  await db.query(insert,['Pessoa do documento',28,2,null]);
  await db.query(insert,['Outro mês',1,3,null]);
  await assert.rejects(db.query(insert,['Vínculo duplicado',29,2,pid]));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
  const calendar=async month=>(await db.query('select * from public.birthday_calendar($1)',[month])).rows;
  assert.equal((await db.query('select * from public.document_birthdays')).rows.length,0,'Source rows are private to management');
  let rows=await calendar(2);assert.equal(rows.length,2);assert.equal(rows.find(r=>r.person_id===pid).full_name,'Pessoa Confirmada');
  assert.deepEqual(Object.keys(rows[0]).sort(),['person_id','full_name','birth_day','birth_month'].sort());
  await db.query('update public.person_contacts set share_birthday=true where person_id=$1',[pid]);
  assert.equal((await calendar(2)).length,2,'Shared personal record replaces the linked document record');
  await db.query('update public.person_contacts set share_birthday=false where person_id=$1',[pid]);
  assert.equal((await calendar(2)).length,1,'Explicit later opt-out hides linked directory entry');
  await assert.rejects(db.query(insert,['Forjado',1,1,null]));
  await db.exec('reset role');
  await db.query("insert into public.document_birthdays(id,display_name,birth_day,birth_month,source_sha256,source_name,source_rows,anniversary_type) values(gen_random_uuid(),'Casal Teste',28,2,repeat('b',64),'Fonte teste.pdf','[]','wedding')");
  await db.exec('set role authenticated');
  const anniversaries=(await db.query('select * from public.anniversary_calendar(2)')).rows;
  assert.equal(anniversaries.length,2);assert.equal(anniversaries.find(r=>r.full_name==='Casal Teste').anniversary_type,'wedding');
  assert.equal((await calendar(2)).length,1,'Legacy birthday endpoint excludes weddings');
  await assert.rejects(db.query('select * from public.anniversary_calendar(13)'));
  await db.exec('reset role;set role anon');await assert.rejects(calendar(2));await assert.rejects(db.query('select * from public.anniversary_calendar(2)'));

 }finally{await db.close();}
});
