import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const folder='work/casamentos-lanches',mode=process.argv[2]||'plan';
mkdirSync(folder,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
async function sql(query){assert.ok(process.env.SUPABASE_ACCESS_TOKEN);const r=await fetch('https://api.supabase.com/v1/projects/ynkfmuseiancpnyloraf/database/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw Error(`Database request failed (${r.status}): ${await r.text()}`);return r.json();}
if(mode==='plan'){
 const report=JSON.parse(readFileSync('work/aniversarios-pdf/report.json','utf8'));
 const birthdays=JSON.parse(readFileSync('work/aniversarios-pdf/plan.json','utf8'));
 const weddings=report.weddings.map(row=>{
  const h=hash(`${birthdays[0].source_sha256}:wedding:${row.name}:${row.date}`),[day,month]=row.date.split('/').map(Number);
  return {id:`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`,display_name:row.name,birth_day:day,birth_month:month,person_id:null,source_sha256:birthdays[0].source_sha256,source_name:birthdays[0].source_name,source_rows:[row],anniversary_type:'wedding'};
 });
 assert.equal(weddings.length,41);assert.equal(new Set(weddings.map(w=>w.id)).size,41);
 const previous=JSON.parse(readFileSync('work/escalas-pdf/plan.json','utf8'))[0];
 const members=[
  [['Rosana','Edna','Nayara','Andréia','Jéssica','Valéria','Cidinha','Danilo (Val)','Néia (Val)','Marcela (Cido)'],['Neusita','Doriani','Cidinha','Maysa','Néia (Val)']],
  [['Angélica','Isabela','Camila (Cláudio)','Martinez','Regiane','Natalia','Duda','Arlete','Nelle','Cida'],['Davi','Regiane','Natalia','Cida']],
  [['Ana Paula','Lia','Priscila','Camila Diniz','Ivanete','Priscila (Adriano)','Jaqueline','Alana','Dalcy','Mayra Prates','Jade'],['Arthur','Marcella (Adriana)','Priscila (Adriano)','Alana']],
  [['Adriana','Lilian','Fabiana (Ado)','Fernanda','Marcela(Bruno)','Liegi','Fabíola','Adriane','Larissa','Bruna'],['Pedro (Ado)','Bruno','Lilian','Adriane']],
 ];
 const groups=members.map((roles,i)=>({id:`g${i+1}`,label:`Grupo ${i+1}`,members:roles.flatMap((names,j)=>names.map((name,k)=>({id:`g${i+1}-${j}-${k+1}`,name,role:j?'Suco':'Lanche',person_id:previous.groups[i].members.find(m=>m.name===name&&m.role===(j?'Suco':'Lanche'))?.person_id??null})))}));
 const columns=[['05/07','02/08','06/09','04/10'],['12/07','16/08','13/09','11/10'],['19/07','23/08','20/09','18/10'],['26/07','30/08','27/09','25/10']];
 const dates=columns.flatMap((days,i)=>days.map(value=>{const [day,month]=value.split('/');const date=`2026-${month}-${day}`;assert.equal(new Date(date+'T12:00:00Z').getUTCDay(),0);return {date,group_id:groups[i].id};}));
 dates.push({date:'2026-08-09',group_id:null,note:'Café da manhã especial de Dia dos Pais. Responsáveis não informados na escala.'});dates.sort((a,b)=>a.date.localeCompare(b.date));
 assert.equal(new Set(dates.map(d=>d.date)).size,17);assert.equal(groups.flatMap(g=>g.members).length,58);
 const roster={id:previous.id,title:previous.title,source_name:'Escala de lanches e sucos EBD — julho a outubro de 2026 (imagem)',source_sha256:hash(readFileSync('C:/Users/perei/AppData/Local/Temp/codex-clipboard-22f12ca0-377a-46a7-a0cf-0fd23cba302c.png')),groups,dates};
 writeFileSync(`${folder}/plan.json`,JSON.stringify({weddings,roster,previous_source_sha256:previous.source_sha256},null,2));console.log(JSON.stringify({weddings:weddings.length,dates:dates.length,roster_members:58,source_year:2026}));
}else if(mode==='schema'){
 const migration=readFileSync('backend/supabase/migrations/202610230031_wedding_anniversaries.sql','utf8');
 await sql(`begin;${migration} insert into supabase_migrations.schema_migrations(version,name,statements) values('202610230031','wedding_anniversaries',array['${migration.replaceAll("'","''")}']) on conflict(version) do nothing; notify pgrst,'reload schema';commit;`);console.log('Wedding calendar schema applied.');
}else if(['rehearse','apply'].includes(mode)){
 const plan=JSON.parse(readFileSync(`${folder}/plan.json`,'utf8')),fingerprint=hash(readFileSync(`${folder}/plan.json`));
 const before={anniversaries:await sql('select * from public.document_birthdays order by id'),rosters:await sql('select * from public.duty_rosters order by id')};
 writeFileSync(`${folder}/before-${mode}.json`,JSON.stringify(before,null,2));
 if(mode==='apply')assert.equal(JSON.parse(readFileSync(`${folder}/rehearsal.json`,'utf8')).hash,fingerprint);
 await sql(`begin;do $import$ declare item jsonb; r public.duty_rosters; p jsonb:=${literal(plan)}; begin
 for item in select * from jsonb_array_elements(p->'weddings') loop
  if exists(select 1 from public.document_birthdays where id=(item->>'id')::uuid and (anniversary_type<>'wedding' or source_sha256<>item->>'source_sha256')) then raise exception 'Existing entry differs'; end if;
  insert into public.document_birthdays(id,display_name,birth_day,birth_month,source_sha256,source_name,source_rows,anniversary_type) values((item->>'id')::uuid,item->>'display_name',(item->>'birth_day')::integer,(item->>'birth_month')::integer,item->>'source_sha256',item->>'source_name',item->'source_rows','wedding') on conflict(id) do nothing;
 end loop;
 item:=p->'roster'; select * into r from public.duty_rosters where id=(item->>'id')::uuid for update;
 if not found or r.title<>item->>'title' or r.source_sha256 not in(p->>'previous_source_sha256',item->>'source_sha256') then raise exception 'Unexpected snack roster; update canceled'; end if;
 update public.duty_rosters set source_name=item->>'source_name',source_sha256=item->>'source_sha256',groups=item->'groups',dates=item->'dates' where id=r.id;
 end $import$;${mode==='rehearse'?'rollback':'commit'};`);
 const after={anniversaries:await sql('select * from public.document_birthdays order by id'),rosters:await sql('select * from public.duty_rosters order by id')};
 if(mode==='rehearse'){assert.deepEqual(after,before);writeFileSync(`${folder}/rehearsal.json`,JSON.stringify({passed:true,hash:fingerprint}));console.log('Wedding import and snack replacement rehearsed and rolled back.');}
 else{
  for(const wedding of plan.weddings){const row=after.anniversaries.find(r=>r.id===wedding.id);for(const key of Object.keys(wedding))assert.deepEqual(row[key],wedding[key]);}
  assert.deepEqual(after.anniversaries.filter(r=>r.anniversary_type==='birthday'),before.anniversaries.filter(r=>r.anniversary_type==='birthday'));
  const snack=after.rosters.find(r=>r.id===plan.roster.id);for(const key of Object.keys(plan.roster))assert.deepEqual(snack[key],plan.roster[key]);
  assert.deepEqual(after.rosters.filter(r=>r.id!==snack.id),before.rosters.filter(r=>r.id!==snack.id));assert.equal(after.rosters.length,before.rosters.length);
  writeFileSync(`${folder}/after.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({weddings:41,snack_dates:snack.dates.length,old_snack_dates_removed:true,birthdays_and_other_rosters_unchanged:true}));
 }
}else if(mode==='verify'){
 await sql(`do $verify$ declare actor uuid; entry public.document_birthdays; begin
 select auth_user_id into actor from public.persons where auth_user_id is not null and merged_into is null order by id limit 1;
 if actor is null then raise exception 'Authenticated identity missing'; end if;perform set_config('request.jwt.claim.sub',actor::text,true);
 for entry in select * from public.document_birthdays where visible loop
  if not exists(select 1 from public.anniversary_calendar(entry.birth_month,0) c where c.person_id=coalesce(entry.person_id,entry.id) and c.birth_day=entry.birth_day and c.anniversary_type=entry.anniversary_type) then raise exception 'Missing calendar entry';end if;
 end loop;end $verify$;`);console.log('All birthdays and wedding anniversaries verified through app calendar.');
}else throw Error('Unknown mode');
