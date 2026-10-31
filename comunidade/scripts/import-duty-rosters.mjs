import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder='work/escalas-pdf',mode=process.argv[2]||'snapshot';
mkdirSync(folder,{recursive:true});assert.ok(process.env.SUPABASE_ACCESS_TOKEN);
async function sql(query){const r=await fetch('https://api.supabase.com/v1/projects/ynkfmuseiancpnyloraf/database/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw Error(`Database request failed (${r.status}): ${await r.text()}`);return r.json();}
const literal=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
if(mode==='snapshot'){
 const people=await sql('select id,full_name,merged_into from public.persons order by full_name,id');
 const records=await sql("select id,data from public.management_records where kind='schedule'");
 writeFileSync(`${folder}/people-before.json`,JSON.stringify(people,null,2));writeFileSync(`${folder}/schedules-before.json`,JSON.stringify(records,null,2));
 console.log(JSON.stringify({people:people.length,existing_schedule_records:records.length}));
}else if(mode==='schema'){
 const migration=readFileSync('backend/supabase/migrations/202610230029_duty_rosters.sql','utf8');
 await sql(`begin; ${migration} insert into supabase_migrations.schema_migrations(version,name,statements) values('202610230029','duty_rosters',array['${migration.replaceAll("'","''")}']) on conflict(version) do nothing; notify pgrst,'reload schema'; commit;`);console.log('Roster schema applied.');
}else if(mode==='rehearse'||mode==='apply'){
 const plan=JSON.parse(readFileSync(`${folder}/plan.json`,'utf8')),hash=createHash('sha256').update(readFileSync(`${folder}/plan.json`)).digest('hex');
 if(mode==='apply')assert.equal(JSON.parse(readFileSync(`${folder}/rehearsal.json`,'utf8')).hash,hash);
 const before=await sql('select * from public.duty_rosters order by id');writeFileSync(`${folder}/rosters-before-${mode}.json`,JSON.stringify(before,null,2));
 await sql(`begin; do $import$ declare item jsonb; current public.duty_rosters; begin
 for item in select * from jsonb_array_elements(${literal(plan)}) loop
 select * into current from public.duty_rosters where id=(item->>'id')::uuid for update;
 if found then
  if current.source_sha256<>item->>'source_sha256' then raise exception 'Existing roster differs from source'; end if;
  continue;
 end if;
 insert into public.duty_rosters(id,title,source_name,source_sha256,groups,dates) values((item->>'id')::uuid,item->>'title',item->>'source_name',item->>'source_sha256',item->'groups',item->'dates');
 end loop; end $import$; ${mode==='rehearse'?'rollback':'commit'};`);
 const after=await sql('select * from public.duty_rosters order by id');
 if(mode==='rehearse'){assert.deepEqual(after,before);writeFileSync(`${folder}/rehearsal.json`,JSON.stringify({passed:true,hash}));console.log('Roster import rehearsed and rolled back.');}
 else{for(const p of plan){const r=after.find(r=>r.id===p.id);assert.ok(r);for(const k of ['title','source_name','source_sha256','groups','dates'])assert.deepEqual(r[k],p[k]);}writeFileSync(`${folder}/rosters-after.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({applied:true,rosters:plan.length,dates:plan.reduce((n,r)=>n+r.dates.length,0),participants:plan.reduce((n,r)=>n+r.groups.reduce((t,g)=>t+g.members.length,0),0)}));}
}else throw Error('Unknown mode.');
