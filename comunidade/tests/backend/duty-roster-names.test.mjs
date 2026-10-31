import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('nomes de escalas: acesso para membros, somente participantes ativos e sem contatos',async()=>{
 const db=new PGlite();
 try {
  await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  const dir=new URL('../../backend/supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const user=crypto.randomUUID(),participant=crypto.randomUUID(),outside=crypto.randomUUID(),archived=crypto.randomUUID();
  await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query("insert into public.persons(id,full_name) values($1,'Nome Completo Conferido'),($2,'Pessoa fora da escala'),($3,'Cadastro antigo')",[participant,outside,archived]);
  await db.query('update public.persons set merged_into=$1 where id=$2',[participant,archived]);
  await db.query("insert into public.duty_rosters(title,source_name,source_sha256,groups,dates) values('Limpeza','Teste',repeat('a',64),$1,'[]')",[[{id:'g1',members:[{person_id:participant},{person_id:participant},{person_id:null},{person_id:archived}]}]]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.duty_roster_people()'),/permission denied/);
  await db.exec('reset role;set role authenticated');
  await assert.rejects(db.query('select * from public.duty_roster_people()'),/forbidden/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  const rows=(await db.query('select * from public.duty_roster_people()')).rows;
  assert.deepEqual(rows,[{person_id:participant,full_name:'Nome Completo Conferido'}]);
  assert.equal((await db.query('select * from public.persons')).rows.length,1,'Acesso comum continua limitado ao próprio cadastro');
 }finally{await db.close();}
});
