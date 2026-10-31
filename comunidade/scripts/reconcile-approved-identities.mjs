import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export async function run({sql,mode,folder}) {
 const s=JSON.parse(readFileSync(`${folder}/snapshot-after-confirmed.json`));
 const person=name=>{const matches=s.persons.filter(p=>!p.merged_into&&p.full_name===name);assert.equal(matches.length,1,name);return matches[0].id;};
 const birth=name=>{const matches=s.document_birthdays.filter(b=>b.anniversary_type==='birthday'&&b.display_name===name);assert.equal(matches.length,1,name);return matches[0];};
 const creates=['Murilo (Marido da Angélica)','Danilo (Marido da Isabella)','Cidinha'].map(name=>({id:birth(name).id,name}));
 creates.push({id:birth('Gabriela').id,name:'Gabriela (filha de Bruno e Fernanda)'});
 const links=[
 ['Murilo (Marido da Angélica)',birth('Murilo (Marido da Angélica)').id],['Danilo (Marido da Isabella)',birth('Danilo (Marido da Isabella)').id],['Cidinha',birth('Cidinha').id],
 ['Angélica',person('Angélica Lisboa')],['Lilian',person('Lilian Pirani')],['Matheus (Domingo)',person('Mateus Henrique')],
 ['Alana (Esposa do Benalle)',person('Alana Trevisani')],['Isabella',person('Isabela Marsoli')],['Jady Neia (Domingo)',person('Jaddy Sousa')],
 ['Marcela (Esposa do Bruno)',person('Marcela Posteraro')],['Bruninha',person('Bruna Vanzeli')],
 ['Giovanna',person('Giovana (responsável por Alícia Marques)')],['Gabriel (Marido da Maysa)',person('Gabriel Chagas')],
 ['Gabi',person('Gabriela Prates')],['Gabriela',birth('Gabriela').id],
 ].map(([name,target])=>({id:birth(name).id,target}));
 const splits=[
 ['Danilo e Isabella',birth('Danilo (Marido da Isabella)').id,person('Isabela Marsoli')],
 ['Murilo e Angélica',birth('Murilo (Marido da Angélica)').id,person('Angélica Lisboa')],
 ['Bruno e Marcela',person('Bruno Ribeiro'),person('Marcela Posteraro')],
 ].map(([name,first,second])=>({source:person(name),targets:[first,second],students:s.ebd_guardians.filter(g=>g.guardian_id===person(name)).map(g=>g.student_id)}));
 const merges=[['Adriana Batista','Adriana Gonzaga'],['Marcella Ferro','Marcella Lisboa']].map(([source,target])=>({source:person(source),target:person(target)}));
 const aliases=new Map([
 ['Edna',person('Edna (Esposa do Nylton)')],['Cida',person('Maria Aparecida Borges')],['Cidinha',birth('Cidinha').id],
 ['Lia',person('Liliana')],['Alana',person('Alana Trevisani')],['Adriana',person('Adriana Lisboa')],['Lilian',person('Lilian Pirani')],
 ['Júlio',person('Júlio César')],['Fabi',person('Fabíola Jané')],['Matheus',person('Mateus')],['Danilo Silvo',person('Danilo Augusto')],
 ['Bruno',person('Bruno (Marido da Fernanda)')],['Tio Marco',person('Marcos Morazotti')],['Néia (Val)',person('Lucineia Silva')],['Valéria',person('Val')],
 ['Angluélica',person('Angélica Lisboa')],['Angélica',person('Angélica Lisboa')],['Werissom',person('Werison Pereira')],['Lucas',person('Lucas Martins')],
 ['Davi',person('Davi Jané')],['Arthur',person('Arthur Gomes')],['Priscila',person('Priscila (Esposa do Rafael)')],['Bruna',person('Bruna Vanzeli')],
 ['Isabela',person('Isabela Marsoli')],['Marcela(Bruno)',person('Marcela Posteraro')],['Giovana',person('Giovana (responsável por Alícia Marques)')],
 ['Jade',person('Jade')],['Nelle',person('Lianelle Pereira')],
 ]);
 const rosterUpdates=s.duty_rosters.map(r=>{
  const after=structuredClone(r.groups);
  for(const group of after)for(const member of group.members){
   const target=member.name==='Marcela'?(group.id==='g2'?person('Marcela da Silva Azevedo'):person('Marcella Lisboa')):aliases.get(member.name);
   if(target){assert.ok(!member.person_id||member.person_id===target,member.name);member.person_id=target;}
  }
  assert.ok(after.flatMap(g=>g.members).every(m=>m.person_id),JSON.stringify(after.flatMap(g=>g.members).filter(m=>!m.person_id).map(m=>m.name)));
  return {id:r.id,before:r.groups,after};
 });
 const renames=[['Fabiana','Fabiana Prates'],['Liliana','Liliana Morazotti']].map(([name,after])=>({id:person(name),before:name,after}));
 const distinct=[
 [person('Gabriela Prates'),birth('Gabriela').id,'Usuário esclareceu: Gabi de dezembro é filha de Ado; Gabriela de janeiro é filha de Bruno e Fernanda.'],
 [person('Bruno Ribeiro'),person('Bruno (Marido da Fernanda)'),'Usuário confirmou: Bruno Ribeiro é marido de Marcela; o marido de Fernanda é outra pessoa.'],
 [person('Murilo Alcarás'),birth('Murilo (Marido da Angélica)').id,'Usuário confirmou que Murilo Alcarás é filho de Ricardo e Jéssica, distinto do marido de Angélica.'],
 [person('Danilo Augusto'),birth('Danilo (Marido da Isabella)').id,'Usuário confirmou que Danilo Augusto é irmão de Val e marido de Raila, distinto do marido de Isabella.'],
 [person('Adriano'),person('Adriano (responsável por Alícia Marques)'),'Usuário confirmou que os responsáveis com Priscila e com Giovana são dois Adrianos diferentes.'],
 [person('Maria Aparecida Borges'),birth('Cidinha').id,'Usuário confirmou que Cida é Maria Aparecida Borges e que Cidinha é outra pessoa.'],
 [person('Lilian Pirani'),person('Liliana'),'Usuário identificou Lilian como esposa de Rodinei e Lia como Liliana Morazotti: pessoas distintas.'],
 ['a78d39cd-7ff5-4565-a21d-712c0cddb807','8428f507-a269-453e-a5de-e4efad287d51','Dois alunos Lucas Gabriel com datas de nascimento e responsáveis diferentes; manter as identidades separadas.'],
 ].map(([source,target,reason])=>({source,target,reason}));
 const batch={creates,links,splits,merges,rosterUpdates,renames,distinct};
 const fingerprint=createHash('sha256').update(JSON.stringify(batch)).digest('hex');
 writeFileSync(`${folder}/approved-identities-plan.json`,JSON.stringify(batch,null,2));
 if(mode==='approved-plan'){console.log(JSON.stringify({merges:merges.length,couples:splits.length,birthdayLinks:links.length,linkedRosterEntries:88}));return;}
 if(mode==='approved-apply')assert.equal(JSON.parse(readFileSync(`${folder}/approved-rehearsal.json`)).fingerprint,fingerprint);else assert.equal(mode,'approved-rehearse');
 const lit=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
 // The complete snapshot remains on disk. Every merge/split additionally uses
 // the app's audited identity review, with original contacts saved before fill.
 await sql(`begin;do $approved$ declare batch jsonb:=${lit(batch)};item jsonb;entry jsonb;actor uuid;source_id uuid;target_id uuid;second_id uuid;review_id uuid;plan jsonb;choices jsonb;contacts_before jsonb;guardians_before jsonb;tbl record;begin
 perform pg_advisory_xact_lock(20261026);
 for tbl in select t.oid::regclass as relation from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relkind='r' and (t.oid in(select conrelid from pg_constraint where contype='f' and confrelid='public.persons'::regclass) or t.relname in('persons','worship_services','duty_rosters','management_records','legacy_mapping')) order by t.relname loop execute format('lock table %s in share row exclusive mode',tbl.relation);end loop;
 select p.auth_user_id into actor from public.persons p join public.role_assignments r on r.person_id=p.id where r.role='admin' and p.auth_user_id is not null and p.full_name not ilike '%fictício%' limit 1;
 if actor is null then raise exception 'Admin required';end if;perform set_config('request.jwt.claim.sub',actor::text,true);
 for item in select * from jsonb_array_elements(batch->'creates') loop insert into public.persons(id,full_name) values((item->>'id')::uuid,item->>'name');end loop;
 for item in select * from jsonb_array_elements(batch->'links') loop
  update public.document_birthdays set person_id=(item->>'target')::uuid where id=(item->>'id')::uuid and person_id is null;
  if not found then raise exception 'Birthday link changed';end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'splits') loop
  source_id:=(item->>'source')::uuid;target_id:=(item->'targets'->>0)::uuid;second_id:=(item->'targets'->>1)::uuid;
  if not exists(select 1 from public.persons where id=source_id and merged_into is null and auth_user_id is null) then raise exception 'Couple changed';end if;
  select coalesce(jsonb_agg(to_jsonb(g)),'[]') into guardians_before from public.ebd_guardians g where guardian_id=source_id;
  if (select count(*) from public.ebd_guardians where guardian_id=source_id)<>jsonb_array_length(item->'students') then raise exception 'Guardians changed';end if;
  insert into public.ebd_guardians(student_id,guardian_id) select student_id,second_id from public.ebd_guardians where guardian_id=source_id on conflict do nothing;
  plan:=private.identity_plan(source_id,target_id);
  if exists(select 1 from jsonb_array_elements(plan->'conflicts') c where c->>'table' not in('person_contacts','ebd_guardians')) then raise exception 'Unexpected split collision';end if;
  select coalesce(jsonb_object_agg(c->>'key','target'),'{}')||'{"profile":"target"}'::jsonb into choices from jsonb_array_elements(plan->'conflicts') c;
  review_id:=public.review_identity(source_id,target_id,'merged','Usuário confirmou os dois responsáveis individuais deste casal; preservar ambos os vínculos com cada aluno.',md5(plan::text),choices);
  update public.identity_reviews set snapshot=snapshot||jsonb_build_object('split_targets',item->'targets','guardians_before_split',guardians_before) where id=review_id;
  update public.legacy_person_records set source_data=source_data||jsonb_build_object('_identity_split',item->'targets') where person_id=target_id and source_data->>'role'='parent' and source_data->>'name' like '% e %';
  for entry in select * from jsonb_array_elements(item->'students') loop
   if not exists(select 1 from public.ebd_guardians where student_id=(entry#>>'{}')::uuid and guardian_id=target_id) or not exists(select 1 from public.ebd_guardians where student_id=(entry#>>'{}')::uuid and guardian_id=second_id) then raise exception 'Missing parent after split';end if;
  end loop;
 end loop;
 for item in select * from jsonb_array_elements(batch->'merges') loop
  source_id:=(item->>'source')::uuid;target_id:=(item->>'target')::uuid;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into contacts_before from public.person_contacts c where person_id in(source_id,target_id);
  if exists(select 1 from public.person_contacts a join public.person_contacts b on b.person_id=target_id where a.person_id=source_id and ((nullif(a.phone,'') is not null and nullif(b.phone,'') is not null and a.phone<>b.phone) or (a.birth_date is not null and b.birth_date is not null and a.birth_date<>b.birth_date) or (nullif(a.email,'') is not null and nullif(b.email,'') is not null and a.email<>b.email))) then raise exception 'Conflicting contact values';end if;
  update public.person_contacts t set phone=coalesce(nullif(t.phone,''),c.phone),email=coalesce(nullif(t.email,''),c.email),birth_date=coalesce(t.birth_date,c.birth_date),avatar_url=coalesce(nullif(t.avatar_url,''),c.avatar_url) from public.person_contacts c where t.person_id=target_id and c.person_id=source_id;
  plan:=private.identity_plan(source_id,target_id);
  if exists(select 1 from jsonb_array_elements(plan->'conflicts') c where c->>'table' not in('person_contacts','ebd_guardians')) then raise exception 'Unexpected identity collision';end if;
  select coalesce(jsonb_object_agg(c->>'key','target'),'{}')||'{"profile":"target"}'::jsonb into choices from jsonb_array_elements(plan->'conflicts') c;
  review_id:=public.review_identity(source_id,target_id,'merged','Usuário confirmou explicitamente que os nomes alternativos identificam a mesma pessoa.',md5(plan::text),choices);
  update public.identity_reviews set snapshot=snapshot||jsonb_build_object('contacts_before_enrichment',contacts_before) where id=review_id;
  update public.management_records set data=jsonb_set(data,'{memberId}',to_jsonb(target_id::text)) where data->>'memberId'=source_id::text;
 end loop;
 for item in select * from jsonb_array_elements(batch->'rosterUpdates') loop
  update public.duty_rosters set groups=item->'after' where id=(item->>'id')::uuid and groups=item->'before';if not found then raise exception 'Roster changed';end if;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'identity.confirmed_roster_links',(item->>'id')::uuid);
 end loop;
 for item in select * from jsonb_array_elements(batch->'renames') loop
  update public.persons set full_name=item->>'after' where id=(item->>'id')::uuid and full_name=item->>'before';if not found then raise exception 'Name changed';end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'distinct') loop
  if not exists(select 1 from public.identity_reviews r where r.decision='distinct' and ((r.source_id=(item->>'source')::uuid and r.target_id=(item->>'target')::uuid) or (r.source_id=(item->>'target')::uuid and r.target_id=(item->>'source')::uuid))) then
   perform public.review_identity((item->>'source')::uuid,(item->>'target')::uuid,'distinct',item->>'reason');
  end if;
 end loop;
 end $approved$;${mode==='approved-rehearse'?'rollback':'commit'};`);
 if(mode==='approved-rehearse')writeFileSync(`${folder}/approved-rehearsal.json`,JSON.stringify({fingerprint,passed:true}));
 console.log(JSON.stringify({mode,merges:merges.length,couplesSplit:splits.length,birthdayLinks:links.length,rosterEntriesLinked:88}));
}
