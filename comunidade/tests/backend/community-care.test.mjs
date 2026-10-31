import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('aniversários e cestas: compartilhamento opcional, compromissos, limites, recebimentos e isolamento', async () => {
 const db = new PGlite();
 try {
  await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  const dir = new URL('../../backend/supabase/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(file, dir), 'utf8'));
  const users = Array.from({length:4}, (_,i) => `90000000-0000-4000-8000-00000000000${i+1}`);
  for (const id of users) await db.query('insert into auth.users(id) values($1)', [id]);
  const people = (await db.query('select id from public.persons order by auth_user_id')).rows.map(r => r.id);
  await db.query("insert into public.role_assignments(person_id,role) values($1,'admin'),($2,'secretary')", [people[0], people[3]]);
  async function actor(i) {
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i] ?? '']);
   await db.exec(i === -1 ? 'set role anon' : 'set role authenticated');
  }
  const rows = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const one = async (sql,args=[]) => (await rows(sql,args))[0];
  await actor(1);
  await db.query("insert into public.person_contacts(person_id,birth_date) values($1,'1992-02-29')", [people[1]]);
  assert.equal((await rows('select * from public.birthday_calendar(2)')).length,0);
  await db.query('update public.person_contacts set share_birthday=true where person_id=$1', [people[1]]);
  const calendar = await rows('select * from public.birthday_calendar(2)');
  assert.equal(calendar.length,1); assert.equal(calendar[0].birth_day,29);
  assert.deepEqual(Object.keys(calendar[0]).sort(), ['person_id','full_name','birth_day','birth_month'].sort());
  assert.equal((await rows('select * from public.birthday_calendar(3)')).length,0);
  await assert.rejects(rows('select * from public.birthday_calendar(13)'));
  await assert.rejects(rows('select * from public.birthday_calendar(2,-1)'));
  await actor(2);
  assert.equal((await rows('select * from public.person_contacts where person_id=$1',[people[1]])).length,0);
  assert.equal((await rows('select * from public.birthday_calendar(2)')).length,1);
  await actor(1);
  await db.query('update public.person_contacts set share_birthday=false where person_id=$1',[people[1]]);
  assert.equal((await rows('select * from public.birthday_calendar(2)')).length,0);
  await assert.rejects(rows("select public.save_food_campaign(null,'Cestas','Orientações','Secretaria',current_date+10,'open')"));
  await actor(0);
  const campaign = (await one("select public.save_food_campaign(null,'Cestas de novembro','Entrega após os cultos','Secretaria',current_date+10,'open') id")).id;
  const item = (await one("select public.save_food_item(null,$1,'Arroz','pacote de 5 kg',10) id",[campaign])).id;
  const beans = (await one("select public.save_food_item(null,$1,'Feijão','pacote de 1 kg',5) id",[campaign])).id;
  await actor(1);
  await assert.rejects(db.query("insert into public.food_items(campaign_id,name,unit,target_quantity) values($1,'Forjado','kg',10)",[campaign]));
  await assert.rejects(rows('select public.commit_food_item($1,-1)',[item]));
  await rows('select public.commit_food_item($1,6)',[item]);
  await rows('select public.commit_food_item($1,6)',[item]); // absolute quantities, retry is idempotent
  await rows('select public.commit_food_item($1,2)',[beans]); // one member can contribute multiple items
  await actor(2);
  await assert.rejects(rows('select public.commit_food_item($1,5)',[item]));
  await rows('select public.commit_food_item($1,4)',[item]);
  const summary = (await rows('select * from public.food_item_summary($1)',[campaign])).find(r=>r.id===item);
  assert.equal(Number(summary.committed_quantity),10); assert.equal(summary.my_quantity,4);
  assert.equal((await rows('select * from public.food_commitments')).length,1);
  await assert.rejects(rows('select public.receive_food_item($1,$2,1)',[item,people[1]]));
  await actor(0);
  await assert.rejects(rows("select public.save_food_item($1,$2,'Arroz','pacote de 5 kg',9)",[item,campaign]));
  await assert.rejects(rows("select public.save_food_item($1,$2,'Arroz','pacote de 1 kg',10)",[item,campaign]));
  await assert.rejects(rows('select public.receive_food_item($1,$2,7)',[item,people[1]]));
  await rows('select public.receive_food_item($1,$2,2)',[item,people[1]]);
  await actor(1);
  await assert.rejects(rows('select public.commit_food_item($1,0)',[item]));
  await rows('select public.commit_food_item($1,3)',[item]);
  await rows('select public.commit_food_item($1,0)',[beans]);
  await actor(2);
  await rows('select public.commit_food_item($1,7)',[item]);
  await actor(3); // secretary can confer deliveries and manage campaigns
  await rows('select public.receive_food_item($1,$2,3)',[item,people[1]]);
  assert.equal(Number((await rows('select * from public.food_item_summary($1)',[campaign])).find(r=>r.id===item).received_quantity),3);
  await rows("select public.save_food_campaign($1,'Cestas de novembro','','Secretaria',current_date+10,'closed')",[campaign]);
  await actor(2);
  await assert.rejects(rows('select public.commit_food_item($1,1)',[item]));
  await actor(0);
  await rows("select public.save_food_campaign($1,'Cestas de novembro','','Secretaria',current_date-1,'open')",[campaign]);
  await actor(2);
  await assert.rejects(rows('select public.commit_food_item($1,1)',[item]));
  await actor(-1);
  await assert.rejects(rows('select * from public.birthday_calendar(2)'));
  await assert.rejects(rows('select * from public.food_item_summary($1)',[campaign]));
  await assert.rejects(rows('select * from public.food_commitments'));
 } finally { await db.close(); }
});
