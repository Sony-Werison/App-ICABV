import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';

test('informações de eventos: edição atômica, leitura pública e autorização',async()=>{
 const db=new PGlite();
 try {
  await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  const dir=new URL('../../backend/supabase/migrations/',import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,dir),'utf8'));
  const admin=crypto.randomUUID(),member=crypto.randomUUID();
  for(const id of [admin,member])await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query("insert into public.role_assignments(person_id,role) select id,'admin' from public.persons where auth_user_id=$1",[admin]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await db.exec('set role authenticated');
  const save=(id,title,payment='Instruções do pagamento',fundraising='Campanha de alimentos')=>db.query("select public.save_event_information($1,$2,'Descrição completa','Salão',now()+interval '5 days',now()+interval '5 days 2 hours',10,'public','published','Encontro',$3,$4) id",[id,title,payment,fundraising]);
  const id=(await save(null,'Encontro da comunidade')).rows[0].id;
  await save(id,'Encontro atualizado','Pagamento na secretaria','Doação de arroz');
  await assert.rejects(save(id,'Não deve salvar','x'.repeat(2001)),/invalid_data/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
  await assert.rejects(save(id,'Sem permissão'),/unauthorized/);
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false);set role anon");
  const event=(await db.query("select * from public.browse_events(0,'','',false) where id=$1",[id])).rows[0];
  assert.equal(event.title,'Encontro atualizado');
  assert.equal(event.payment_details,'Pagamento na secretaria');
  assert.equal(event.fundraising_details,'Doação de arroz');
  await assert.rejects(save(id,'Anônimo'),/permission denied/);
 }finally{await db.close();}
});
