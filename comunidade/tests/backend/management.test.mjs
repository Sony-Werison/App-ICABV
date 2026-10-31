import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';
test('gestão integrada: RLS, autoria, validação, conflitos e vínculos',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 for(const file of ['202610200001_foundation.sql','202610220011_management_records.sql'])await db.exec(await readFile(new URL('../../backend/supabase/migrations/'+file,import.meta.url),'utf8'));
 const users=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
 for(const id of users)await db.query('insert into auth.users(id) values($1)',[id]);
 const persons=(await db.query('select id from public.persons order by auth_user_id')).rows;
 for(const [i,role] of ['admin','member','treasurer'].entries())await db.query('insert into public.role_assignments(person_id,role) values($1,$2)',[persons[i].id,role]);
 async function actor(i){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users[i]]);await db.exec('set role authenticated');}
 async function save(kind,data,id=null,version=null){return (await db.query('select public.save_management_record($1,$2,$3,$4) as id',[id,kind,JSON.stringify(data),version])).rows[0].id;}
 const tx={description:'Teste',direction:'Entrada',amount:15000,category:'Oferta',date:'2026-10-22',status:'Realizado',notes:''};
 await actor(0);const tid=await save('transaction',tx);
 await assert.rejects(save('transaction',{...tx,amount:-1}));await assert.rejects(save('transaction',{...tx,amount:1.25}));await assert.rejects(save('transaction',{...tx,date:'2026-02-30'}));await assert.rejects(save('transaction',{...tx,extra:'forjado'}));
 await save('transaction',{...tx,amount:16000},tid,1);await assert.rejects(save('transaction',tx,tid,1));
 const content={title:'Texto',type:'Devocional',body:'Reflexão',reference:'',speaker:'',url:'',date:'2026-10-22',status:'Rascunho'};
 const draft=await save('content',content);await assert.rejects(save('content',{...content,url:'javascript:alert(1)'}));await assert.rejects(save('content',{...content,url:'https://user:pass@example.com'}));
 const published=await save('content',{...content,status:'Publicado'});
 const prayer=await save('prayer',{title:'Privado',body:'Pedido',date:'2026-10-22',status:'Aberto',authorId:users[1],authorName:'Forjado'});
 assert.equal((await db.query('select data from public.management_records where id=$1',[prayer])).rows[0].data.authorId,users[0]);
 const member=await save('member',{name:'Pessoa',email:'',phone:'',status:'Membro',ministry:'Louvor',birthday:'',notes:''});
 const shift={ministry:'Louvor',duty:'Voz',memberId:member,eventId:'',date:'2027-01-01',time:'19:00',status:'Pendente',notes:''};const sid=await save('schedule',shift);await assert.rejects(save('schedule',shift));await assert.rejects(db.query('select public.delete_management_record($1,1)',[member]));
 await actor(1);const visible=(await db.query('select id from public.management_records')).rows.map(r=>r.id);assert.ok(visible.includes(published));for(const hidden of [draft,tid,prayer,member,sid])assert.ok(!visible.includes(hidden));await assert.rejects(save('transaction',tx));await assert.rejects(db.query("insert into public.management_records(kind,data) values('notice','{}')"));
 await actor(2);assert.equal((await db.query("select count(*)::int n from public.management_records where kind='transaction'")).rows[0].n,1);await save('transaction',tx);await assert.rejects(save('content',content));
 await actor(0);await db.query('select public.delete_management_record($1,1)',[sid]);await db.query('select public.delete_management_record($1,1)',[member]);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.management_records'));
 }finally{await db.close();}
});
