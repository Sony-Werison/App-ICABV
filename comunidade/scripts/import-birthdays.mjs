import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='work/aniversarios-pdf',mode=process.argv[2]||'snapshot';
assert.ok(process.env.SUPABASE_ACCESS_TOKEN);
async function sql(query){const r=await fetch('https://api.supabase.com/v1/projects/ynkfmuseiancpnyloraf/database/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw Error(`Database request failed (${r.status}): ${await r.text()}`);return r.json();}
if(mode==='snapshot'){
 const people=await sql('select p.id,p.full_name,p.merged_into,c.birth_date,c.share_birthday from public.persons p left join public.person_contacts c on c.person_id=p.id order by p.full_name,p.id');
 writeFileSync(`${folder}/people-before.json`,JSON.stringify(people,null,2));console.log(JSON.stringify({people:people.length,existing_dates:people.filter(p=>p.birth_date).length}));
}else if(mode==='verify'){
 await sql(`do $verify$ declare actor uuid; entry public.document_birthdays; begin
 select auth_user_id into actor from public.persons where auth_user_id is not null and merged_into is null order by id limit 1;
 if actor is null then raise exception 'No authenticated identity for verification'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 for entry in select * from public.document_birthdays where visible loop
  if not exists(select 1 from public.birthday_calendar(entry.birth_month,0) c where c.person_id=coalesce(entry.person_id,entry.id) and c.birth_day=entry.birth_day)
   then raise exception 'Imported birthday missing from calendar: %',entry.id; end if;
 end loop;
 end $verify$;`);
 const counts=await sql('select birth_month,count(*)::integer as birthdays from public.document_birthdays where visible group by birth_month order by birth_month');
 writeFileSync(`${folder}/calendar-verification.json`,JSON.stringify({passed:true,counts},null,2));console.log(JSON.stringify({calendar_verified:true,birthdays:counts.reduce((n,r)=>n+r.birthdays,0)}));
}else if(mode==='schema'){
 const migration=readFileSync('backend/supabase/migrations/202610230030_document_birthdays.sql','utf8');
 await sql(`begin; ${migration} insert into supabase_migrations.schema_migrations(version,name,statements) values('202610230030','document_birthdays',array['${migration.replaceAll("'","''")}']) on conflict(version) do nothing; notify pgrst,'reload schema'; commit;`);console.log('Birthday schema applied.');
}else if(['rehearse','apply'].includes(mode)){
 const plan=JSON.parse(readFileSync(`${folder}/plan.json`,'utf8')),hash=createHash('sha256').update(readFileSync(`${folder}/plan.json`)).digest('hex');
 if(mode==='apply')assert.equal(JSON.parse(readFileSync(`${folder}/rehearsal.json`,'utf8')).hash,hash);
 const before=await sql('select * from public.document_birthdays order by id');
 writeFileSync(`${folder}/before-${mode}.json`,JSON.stringify(before,null,2));
 const quoted="'"+JSON.stringify(plan).replaceAll("'","''")+"'::jsonb";
 await sql(`begin; do $import$ declare item jsonb; existing public.document_birthdays; begin
 for item in select * from jsonb_array_elements(${quoted}) loop
 select * into existing from public.document_birthdays where id=(item->>'id')::uuid for update;
 if found then if existing.source_sha256<>item->>'source_sha256' then raise exception 'Source mismatch'; end if; continue; end if;
 insert into public.document_birthdays(id,display_name,birth_day,birth_month,person_id,source_sha256,source_name,source_rows) values((item->>'id')::uuid,item->>'display_name',(item->>'birth_day')::integer,(item->>'birth_month')::integer,nullif(item->>'person_id','')::uuid,item->>'source_sha256',item->>'source_name',item->'source_rows');
 end loop; end $import$; ${mode==='rehearse'?'rollback':'commit'};`);
 const after=await sql('select * from public.document_birthdays order by id');
 if(mode==='rehearse'){assert.deepEqual(after,before);writeFileSync(`${folder}/rehearsal.json`,JSON.stringify({passed:true,hash}));console.log('Birthday import rehearsed and rolled back.');}
 else{
  for(const p of plan){const r=after.find(r=>r.id===p.id);assert.ok(r);for(const k of Object.keys(p))assert.deepEqual(r[k],p[k]);}
  const people=await sql('select p.id,p.full_name,p.merged_into,c.birth_date,c.share_birthday from public.persons p left join public.person_contacts c on c.person_id=p.id order by p.full_name,p.id');
  assert.deepEqual(people,JSON.parse(readFileSync(`${folder}/people-before.json`,'utf8')));
  writeFileSync(`${folder}/after.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({imported:plan.length,linked:plan.filter(p=>p.person_id).length,people_and_contacts_unchanged:true}));
 }
}else throw Error('Unknown mode');
