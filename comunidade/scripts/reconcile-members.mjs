import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder='work/revisao-pessoas',mode=process.argv[2]||'snapshot';
async function sql(query){assert.ok(process.env.SUPABASE_ACCESS_TOKEN);const r=await fetch('https://api.supabase.com/v1/projects/ynkfmuseiancpnyloraf/database/query',{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw Error(`Database request failed (${r.status}): ${await r.text()}`);return r.json();}
if(['schema-events','schema-roster-names','schema-management-summary','schema-people-review'].includes(mode)){
 const [version,name]=({'schema-events':['202610230032','event_information'],'schema-roster-names':['202610230033','duty_roster_names'],'schema-management-summary':['202610230034','management_summary'],'schema-people-review':['202610230035','people_review']})[mode];
 const migration=readFileSync(`backend/supabase/migrations/${version}_${name}.sql`,'utf8');
 const installed=await sql(`select version from supabase_migrations.schema_migrations where version='${version}'`);
 if(!installed.length)await sql(`begin;${migration} insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array['${migration.replaceAll("'","''")}']);notify pgrst,'reload schema';commit;`);
 console.log(`${name} schema ready.`);
}else if(mode==='sources-audit'){
 const rows=await sql("select 'management_records' as source,kind,count(*)::int as records from public.management_records group by kind union all select 'persons','current',count(*)::int from public.persons where merged_into is null union all select 'persons','archived',count(*)::int from public.persons where merged_into is not null union all select 'events','all',count(*)::int from public.events union all select 'community_units',kind,count(*)::int from public.community_units group by kind order by source,kind");
 writeFileSync(`${folder}/sources-audit.json`,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
}else if(mode==='admin-account'){
 const rows=await sql("select p.full_name,u.email from public.persons p join auth.users u on u.id=p.auth_user_id where p.merged_into is null and p.full_name='Werison Pereira' and exists(select 1 from public.role_assignments r where r.person_id=p.id and r.role='admin')");
 console.log(JSON.stringify(rows));
}else if(mode==='verify-roster-names'){
 const rows=await sql("with actor as materialized(select set_config('request.jwt.claim.sub',(select p.auth_user_id::text from public.persons p join public.role_assignments r on r.person_id=p.id where r.role='admin' and p.auth_user_id is not null and p.full_name not ilike '%fictício%' limit 1),true)) select (select count(*) from public.duty_roster_people()) as names,(select count(*) from public.duty_rosters r,lateral jsonb_array_elements(r.groups) g,lateral jsonb_array_elements(g->'members') m where not exists(select 1 from public.duty_roster_people() p where p.person_id::text=m->>'person_id')) as missing from actor");
 assert.equal(Number(rows[0].missing),0);console.log(JSON.stringify({peopleAvailable:Number(rows[0].names),participantsWithoutNames:Number(rows[0].missing)}));
}else if(mode==='duplicate-scan'){
 const rows=await sql("with actor as materialized(select set_config('request.jwt.claim.sub',(select p.auth_user_id::text from public.persons p join public.role_assignments r on r.person_id=p.id where r.role='admin' and p.auth_user_id is not null and p.full_name not ilike '%fictício%' limit 1),true)) select public.identity_duplicates(0) as duplicates from actor");
 const duplicates=rows[0].duplicates;
 writeFileSync(`${folder}/remaining-duplicates.json`,JSON.stringify(duplicates,null,2));
 console.log(JSON.stringify({candidates:duplicates.length,pairs:duplicates.map(p=>({left:p.left.name,right:p.right.name,name:p.name_match,email:p.email_match,phone:p.phone_match}))}));
}else if(mode==='verify'){
 const snapshot={};for(const table of ['persons','person_contacts','document_birthdays','ebd_guardians','ebd_class_members','worship_services','legacy_person_records','duty_rosters','identity_reviews'])snapshot[table]=await sql(`select * from public.${table}`);
 writeFileSync(`${folder}/snapshot-after-confirmed.json`,JSON.stringify(snapshot,null,2));
 const birthdays=snapshot.document_birthdays.filter(b=>b.anniversary_type==='birthday');
 const archived=new Set(snapshot.persons.filter(p=>p.merged_into).map(p=>p.id));
 assert.ok(snapshot.ebd_guardians.every(g=>!archived.has(g.guardian_id)&&!archived.has(g.student_id)));
 assert.ok(birthdays.every(b=>!archived.has(b.person_id)));
 assert.ok(snapshot.ebd_class_members.every(m=>!archived.has(m.person_id)));
 assert.ok(snapshot.worship_services.every(s=>Object.values(s.assignments).flat().every(id=>!archived.has(id))));
 assert.ok(snapshot.duty_rosters.every(r=>r.groups.flatMap(g=>g.members).every(m=>!archived.has(m.person_id))));
 const pendingCouples=snapshot.persons.filter(p=>!p.merged_into&&snapshot.legacy_person_records.some(l=>l.person_id===p.id&&l.source_data?.role==='parent'&&l.source_data?.name===p.full_name&&p.full_name.includes(' e '))).map(p=>p.full_name);
 const splitCount=snapshot.identity_reviews.filter(r=>r.decision==='merged'&&r.snapshot?.split_targets).length;
 const mergeCount=snapshot.identity_reviews.filter(r=>r.decision==='merged'&&!r.snapshot?.split_targets).length;
 writeFileSync(`${folder}/resultado.md`,[
 '# Revisão de pessoas — 23/10/2026',
 '',
 `Aplicado: ${mergeCount} pares confirmados unificados; ${splitCount} cadastros conjuntos separados, com os dois responsáveis vinculados aos alunos; datas de Ruan, Lucas Gabriel e Samuel corrigidas, preservando o ano de nascimento.`,
 '',
 `Aniversários vinculados: ${birthdays.filter(b=>b.person_id).length}/${birthdays.length}. Participações de lanches/limpeza vinculadas: ${snapshot.duty_rosters.flatMap(r=>r.groups.flatMap(g=>g.members)).filter(m=>m.person_id).length}/88. Contas de acesso não foram criadas ou excluídas.`,
 '',
 '## Cadastros conjuntos pendentes',...(pendingCouples.length?pendingCouples.map(n=>`- ${n}`):['Nenhum.']),
 '',
 '## Aniversários cuja identidade ainda requer confirmação',...(birthdays.some(b=>!b.person_id)?birthdays.filter(b=>!b.person_id).map(b=>`- ${b.display_name}: ${b.birth_day}/${b.birth_month}`):['Nenhum.']),
 '',
 '## Participações cuja identidade ainda requer confirmação',...(snapshot.duty_rosters.some(r=>r.groups.some(g=>g.members.some(m=>!m.person_id)))?snapshot.duty_rosters.flatMap(r=>r.groups.flatMap(g=>g.members.filter(m=>!m.person_id).map(m=>`- ${r.id.endsWith('2')?'Limpeza':'Lanches/sucos'} · ${g.label} · ${m.name} · ${m.role}`))):['Nenhuma.']),
 '',
 'Os 14 registros sem nome do cadastro original foram mantidos separados. Os identificadores antigos arquivados e os históricos de revisão foram preservados para rastreabilidade.',
 ].join('\n'));
 console.log(JSON.stringify({archivedIdentities:archived.size,birthdaysLinked:birthdays.filter(b=>b.person_id).length,birthdaysTotal:birthdays.length,guardianLinks:snapshot.ebd_guardians.length,pendingCouples,activeLinksVerified:true}));
}else if(mode.startsWith('approved-')){
 await (await import('./reconcile-approved-identities.mjs')).run({sql,mode,folder});
}else if(mode.startsWith('roster-')){
 await (await import('./reconcile-roster-links.mjs')).run({sql,mode,folder});
}else if(mode.startsWith('confirmed-')){
 await (await import('./reconcile-confirmed-members.mjs')).run({sql,mode,folder});
}else if(mode==='snapshot'){
 const tables=['persons','person_contacts','legacy_person_records','family_members','families','ebd_guardians','ebd_classes','ebd_class_members','worship_members','worship_services','duty_rosters','document_birthdays','identity_reviews'];
 const snapshot={};
 for(const table of tables)snapshot[table]=await sql(`select * from public.${table}`);
 snapshot.auth_links=await sql('select p.id,u.email_confirmed_at is not null as verified from public.persons p join auth.users u on u.id=p.auth_user_id');
 writeFileSync(`${folder}/snapshot.json`,JSON.stringify(snapshot,null,2));
 console.log(JSON.stringify(Object.fromEntries(tables.map(t=>[t,snapshot[t].length]))));
}else if(mode==='plans'){
 const pairs=JSON.parse(readFileSync(`${folder}/canonical-pairs.json`,'utf8'));
 const plans=[];
 for(const pair of pairs){const rows=await sql(`select private.identity_plan('${pair.source}'::uuid,'${pair.target}'::uuid) as plan`);plans.push({...pair,plan:rows[0].plan});}
 writeFileSync(`${folder}/merge-plans.json`,JSON.stringify(plans,null,2));console.log(JSON.stringify({plans:plans.length,conflicts:plans.reduce((n,p)=>n+p.plan.conflicts.length,0)}));
}else if(['merge-rehearse','merge-apply'].includes(mode)){
 const pairs=JSON.parse(readFileSync(`${folder}/merge-plans.json`,'utf8'));
 assert.equal(pairs.length,11);
 const fingerprint=createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
 if(mode==='merge-apply')assert.equal(JSON.parse(readFileSync(`${folder}/merge-rehearsal.json`,'utf8')).fingerprint,fingerprint);
 const before=await sql('select to_jsonb(p) as person from public.persons p order by p.id');
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 await sql(`begin;do $merge$ declare item jsonb; plan jsonb; actor uuid; review_id uuid; previous_contacts jsonb; choices jsonb; tbl record; begin
 perform pg_advisory_xact_lock(20261026);
 select p.auth_user_id into actor from public.persons p join public.role_assignments r on r.person_id=p.id where r.role='admin' and p.auth_user_id is not null and p.full_name not ilike '%fictício%' limit 1;
 if actor is null then raise exception 'Admin account required';end if;perform set_config('request.jwt.claim.sub',actor::text,true);
 for tbl in select t.oid::regclass as relation from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relkind='r' and (t.oid in(select conrelid from pg_constraint where contype='f' and confrelid='public.persons'::regclass) or t.relname in('persons','worship_services','duty_rosters','management_records','legacy_mapping')) order by t.relname loop execute format('lock table %s in share row exclusive mode',tbl.relation);end loop;
 for item in select * from jsonb_array_elements(${literal(pairs)}) loop
  if private.identity_plan((item->>'source')::uuid,(item->>'target')::uuid)<>item->'plan' then raise exception 'Identity changed since review: %',item->>'name';end if;
 end loop;
 for item in select * from jsonb_array_elements(${literal(pairs)}) loop
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into previous_contacts from public.person_contacts c where c.person_id in((item->>'source')::uuid,(item->>'target')::uuid);
  update public.person_contacts t set phone=coalesce(nullif(t.phone,''),s.phone),email=coalesce(nullif(t.email,''),s.email),birth_date=coalesce(t.birth_date,s.birth_date),avatar_url=coalesce(nullif(t.avatar_url,''),s.avatar_url) from public.person_contacts s where t.person_id=(item->>'target')::uuid and s.person_id=(item->>'source')::uuid;
  plan:=private.identity_plan((item->>'source')::uuid,(item->>'target')::uuid);
  if exists(select 1 from jsonb_array_elements(plan->'conflicts') c where c->>'table'<>'person_contacts') then raise exception 'Unexpected collision';end if;
  select coalesce(jsonb_object_agg(c->>'key','target'),'{}') into choices from jsonb_array_elements(plan->'conflicts') c;
  review_id:=public.review_identity((item->>'source')::uuid,(item->>'target')::uuid,'merged','Usuário confirmou que os dois cadastros com este nome são a mesma pessoa; preservar dados complementares e todos os vínculos.',md5(plan::text),choices);
  update public.identity_reviews set snapshot=jsonb_set(snapshot,'{contacts_before_enrichment}',previous_contacts) where id=review_id;
  update public.management_records set data=jsonb_set(data,'{memberId}',to_jsonb(item->>'target')) where data->>'memberId'=item->>'source';
  update public.duty_rosters r set groups=(select jsonb_agg(jsonb_set(g.value,'{members}',(select jsonb_agg(case when m.value->>'person_id'=item->>'source' then jsonb_set(m.value,'{person_id}',to_jsonb(item->>'target')) else m.value end order by m.ordinality) from jsonb_array_elements(g.value->'members') with ordinality m)) order by g.ordinality) from jsonb_array_elements(r.groups) with ordinality g) where r.groups::text like '%'||(item->>'source')||'%';
 end loop;end $merge$;${mode==='merge-rehearse'?'rollback':'commit'};`);
 const after=await sql('select to_jsonb(p) as person from public.persons p order by p.id');
 if(mode==='merge-rehearse'){assert.deepEqual(after,before);writeFileSync(`${folder}/merge-rehearsal.json`,JSON.stringify({passed:true,fingerprint}));console.log('11 confirmed identities rehearsed and rolled back.');}
 else{
  for(const pair of pairs)assert.equal(after.find(p=>p.person.id===pair.source).person.merged_into,pair.target);
  writeFileSync(`${folder}/persons-after-merges.json`,JSON.stringify(after,null,2));console.log(JSON.stringify({merged:11,archived_sources:11,accounts_deleted:0}));
 }
}else throw Error('Unknown mode');
