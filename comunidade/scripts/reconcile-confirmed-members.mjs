import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Only confirmed identities or names supported by matching family context/date.
// Uncertain aliases are deliberately excluded until the user answers.
export async function run({sql,mode,folder}) {
 const original=JSON.parse(readFileSync(`${folder}/snapshot.json`));
 const pairs=JSON.parse(readFileSync(`${folder}/canonical-pairs.json`));
 const canonical=id=>pairs.find(p=>p.source===id)?.target??id;
 const person=name=>{const matches=[...new Set(original.persons.filter(p=>p.full_name===name).map(p=>canonical(p.id)))];assert.equal(matches.length,1,`Unique person: ${name}`);return matches[0];};
 const birthday=name=>{const matches=original.document_birthdays.filter(b=>b.anniversary_type==='birthday'&&b.display_name===name);assert.equal(matches.length,1,`Unique birthday: ${name}`);return matches[0];};
 const links=[];
 for(const [alias,name] of [
 ['Danilo (Irmão da Val)','Danilo Augusto'],['Bruno (Marido da Marcela)','Bruno Ribeiro'],['Murilo (Filho do Ricardo e Jéssica)','Murilo Alcarás'],
 ['Ruan','Ruan Victor'],['Lucas (Filho do Dalcy e Kelly)','8428f507-a269-453e-a5de-e4efad287d51'],['Samuel (Filho da Delvânia)','Samuel Lobato'],
 ['Werison','Werison Pereira'],['Lianelle','Lianelle Pereira'],['Mayra Carolina Prates','Mayra Prates'],['Lucineia Helena da Silva','Lucineia Silva'],
 ['Marcos Morazoti','Marcos Morazotti'],['Ana Luisa','Ana Luiza'],['Pedro Henrique','Pedro Prates'],['Isabela (Filha Adriane e Andrevaldo)','Isabella Alves'],
 ['Marcela (Filha da Adriana Lisboa)','Marcella Lisboa'],['Rosana','Rosana Jané'],['Mayra','Mayra Martins'],['Natália','Natália Gonçalves'],
 ['Andréia','Andréia Martins'],['Jaqueline','Jaqueline Barros'],['Delvânia','Delvânia Lobato'],['Rudinei','Rudinei de Souza'],
 ['Breno','Breno Ribeiro'],['Rafael','Rafael Jané'],['Jônatas','Jônatas Jané'],['Fabíola','Fabíola Jané'],['Regiane','Regiane Martins'],
 ['Ana Paula','Ana Paula Batista'],['Maysa','Maysa Martins'],['Davi (Marido da Rosana)','Davi Jané'],['Lucas (Marido da Andréia)','Lucas Martins'],['Mavie','Mavie']
 ])links.push({birthday:birthday(alias).id,person:/^[a-f0-9-]{36}$/.test(name)?name:person(name)});
 const creates=[];
 const newBirthday=name=>{const b=birthday(name);assert.equal(b.person_id,null);if(!creates.some(p=>p.id===b.id))creates.push({id:b.id,name:b.display_name,birthday:b.id});return b.id;};
 const splitRows=[
 ['Wilson e Jaqueline',newBirthday('Wilson'),person('Jaqueline Barros')],
 ['Elton e Edna',newBirthday('Elton'),newBirthday('Edna (Esposa do Elton)')],
 ['Matheus e Val',newBirthday('Mateus'),newBirthday('Val')],
 ['Andrevaldo e Adriane',newBirthday('Andrevaldo'),newBirthday('Adriane')],
 ['Lucas e Andreia',person('Lucas Martins'),person('Andréia Martins')],
 ['Cláudio e Camila',newBirthday('Cláudio'),newBirthday('Camila Meireles')],
 ['Fernando e Adriana',newBirthday('Fernando (Marido da Adriana)'),person('Adriana Lisboa')],
 ['Rafael e Priscila',person('Rafael Jané'),newBirthday('Priscila (Esposa do Rafael)')],
 ['Adriano e Priscila',newBirthday('Adriano'),newBirthday('Priscila (Esposa do Adriano)')],
 ['Jhonathan e Duda',newBirthday('Jonathan'),newBirthday('Duda')],
 ['Ricardo e Amanda',newBirthday('Ricardo (Marido da Amanda)'),null],
 ['Ricardo e Jéssica',person('Ricardo Alcarás'),newBirthday('Jéssica')],
 ['Marcos e Mariele',newBirthday('Marcos Vinicius'),newBirthday('Mariele')],
 ['Marquinho e Ana Paula',newBirthday('Marquinho'),person('Ana Paula Batista')],
 ['Cido e Marcela',newBirthday('José Aparecido Azevedo'),newBirthday('Marcela da Silva Azevedo')],
 ['Walker e Nayara',newBirthday('Walker'),newBirthday('Nayara')],
 ['Bruno e Fernanda',newBirthday('Bruno (Marido da Fernanda)'),newBirthday('Fernanda')],
 ['Adriano e Giovana',null,null],
 ['Dalcy e Kelly',newBirthday('Dalcy'),newBirthday('Kelly')],
 ['Cleuzano e Martinez',newBirthday('Cleuzano'),newBirthday('Martinez')],
 ['Jônatas e Fabíola',person('Jônatas Jané'),person('Fabíola Jané')],
 ['Ado e Fabiana',newBirthday('Ado'),newBirthday('Fabiana')],
 ['Rudinei e Mayra',person('Rudinei de Souza'),person('Mayra Martins')],
 ['Fernando e Liége',newBirthday('Fernando (Marido da Liegi)'),newBirthday('Liegi')],
 ];
 const splits=splitRows.map(([name,first,second])=>{
  const source=person(name);
  const ids=[first,second].map((id,index)=>{
   if(id)return id;
   const hex=createHash('sha256').update(`${source}:${index}`).digest('hex');
   const generated=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
   creates.push({id:generated,name:name==='Ricardo e Amanda'?'Amanda (responsável por Miguel Landim)':index===0?'Adriano (responsável por Alícia Marques)':'Giovana (responsável por Alícia Marques)'});return generated;
  });
  return {source,targets:ids,name,students:original.ebd_guardians.filter(g=>g.guardian_id===source).map(g=>g.student_id)};
 });
 const dates=[{id:person('Ruan Victor'),before:'2016-02-29',after:'2016-02-28'},{id:'8428f507-a269-453e-a5de-e4efad287d51',before:'2019-10-13',after:'2019-09-13'},{id:person('Samuel Lobato'),before:'2003-06-11',after:'2003-06-12'}];
 const rosterLinks=[{roster:'98000000-0000-4000-8000-000000000001',member:'g1-0-8',person:person('Danilo Augusto')},{roster:'98000000-0000-4000-8000-000000000001',member:'g3-0-4',person:person('Camila Zanirato')}];
 const batch={creates,links,splits,dates,rosterLinks};
 const fingerprint=createHash('sha256').update(JSON.stringify(batch)).digest('hex');
 writeFileSync(`${folder}/confirmed-plan.json`,JSON.stringify(batch,null,2));
 if(mode==='confirmed-plan'){console.log(JSON.stringify({newIndividualRecords:creates.length,birthdayLinks:links.length,splits:splits.length,dateCorrections:dates.length}));return;}
 if(mode==='confirmed-apply')assert.equal(JSON.parse(readFileSync(`${folder}/confirmed-rehearsal.json`)).fingerprint,fingerprint);
 else assert.equal(mode,'confirmed-rehearse');
 const lit=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
 const before=await sql('select to_jsonb(p) as person from public.persons p order by p.id');
 await sql(`begin;do $batch$ declare batch jsonb:=${lit(batch)}; item jsonb; entry jsonb; source_id uuid; first_id uuid; second_id uuid; review_id uuid; plan jsonb; choices jsonb; actor uuid; old_guardians jsonb; begin
 perform pg_advisory_xact_lock(20261026);
 lock table public.persons,public.person_contacts,public.ebd_guardians,public.document_birthdays,public.legacy_person_records,public.duty_rosters in share row exclusive mode;
 select p.auth_user_id into actor from public.persons p join public.role_assignments r on r.person_id=p.id where r.role='admin' and p.auth_user_id is not null and p.full_name not ilike '%fictício%' limit 1;
 if actor is null then raise exception 'Admin required';end if;perform set_config('request.jwt.claim.sub',actor::text,true);
 for item in select * from jsonb_array_elements(batch->'creates') loop
  insert into public.persons(id,full_name) values((item->>'id')::uuid,item->>'name');
  if item ? 'birthday' then update public.document_birthdays set person_id=(item->>'id')::uuid where id=(item->>'birthday')::uuid and person_id is null;if not found then raise exception 'Birthday changed';end if;end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'dates') loop
  update public.person_contacts set birth_date=(item->>'after')::date where person_id=(item->>'id')::uuid and birth_date=(item->>'before')::date;
  if not found then raise exception 'Birth date changed';end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'links') loop
  update public.document_birthdays set person_id=(item->>'person')::uuid where id=(item->>'birthday')::uuid and (person_id is null or person_id=(item->>'person')::uuid);
  if not found then raise exception 'Birthday identity changed';end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'rosterLinks') loop
  update public.duty_rosters r set groups=(select jsonb_agg(jsonb_set(g.value,'{members}',(select jsonb_agg(case when m.value->>'id'=item->>'member' then jsonb_set(m.value,'{person_id}',to_jsonb(item->>'person')) else m.value end order by m.ordinality) from jsonb_array_elements(g.value->'members') with ordinality m)) order by g.ordinality) from jsonb_array_elements(r.groups) with ordinality g) where r.id=(item->>'roster')::uuid;
 end loop;
 for item in select * from jsonb_array_elements(batch->'splits') loop
  source_id:=(item->>'source')::uuid;first_id:=(item->'targets'->>0)::uuid;second_id:=(item->'targets'->>1)::uuid;
  if exists(select 1 from public.persons where id=source_id and (auth_user_id is not null or merged_into is not null)) then raise exception 'Couple identity changed';end if;
  select coalesce(jsonb_agg(to_jsonb(g)),'[]') into old_guardians from public.ebd_guardians g where guardian_id=source_id;
  if (select count(*) from public.ebd_guardians where guardian_id=source_id)<>jsonb_array_length(item->'students') then raise exception 'Guardian links changed';end if;
  insert into public.ebd_guardians(student_id,guardian_id) select student_id,second_id from public.ebd_guardians where guardian_id=source_id on conflict do nothing;
  plan:=private.identity_plan(source_id,first_id);
  if exists(select 1 from jsonb_array_elements(plan->'conflicts') c where c->>'table' not in('person_contacts','ebd_guardians')) then raise exception 'Unexpected collision';end if;
  select coalesce(jsonb_object_agg(c->>'key','target'),'{}')||'{"profile":"target"}'::jsonb into choices from jsonb_array_elements(plan->'conflicts') c;
  review_id:=public.review_identity(source_id,first_id,'merged','Usuário autorizou separar o cadastro conjunto em duas pessoas, mantendo ambas como responsáveis pelos mesmos alunos.',md5(plan::text),choices);
  update public.identity_reviews set snapshot=snapshot||jsonb_build_object('split_targets',item->'targets','guardians_before_split',old_guardians) where id=review_id;
  update public.legacy_person_records set source_data=source_data||jsonb_build_object('_identity_split',item->'targets') where person_id=first_id and source_data->>'name'=item->>'name';
  for entry in select * from jsonb_array_elements(item->'students') loop
   if not exists(select 1 from public.ebd_guardians where student_id=(entry#>>'{}')::uuid and guardian_id=first_id) or not exists(select 1 from public.ebd_guardians where student_id=(entry#>>'{}')::uuid and guardian_id=second_id) then raise exception 'Missing guardian after split';end if;
  end loop;
 end loop;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'identity.confirmed_dates_and_links',null);
 end $batch$;${mode==='confirmed-rehearse'?'rollback':'commit'};`);
 const after=await sql('select to_jsonb(p) as person from public.persons p order by p.id');
 if(mode==='confirmed-rehearse'){assert.deepEqual(after,before);writeFileSync(`${folder}/confirmed-rehearsal.json`,JSON.stringify({fingerprint,passed:true}));}
 else {writeFileSync(`${folder}/persons-after-split.json`,JSON.stringify(after,null,2));for(const split of splits)assert.equal(after.find(p=>p.person.id===split.source).person.merged_into,split.targets[0]);}
 console.log(JSON.stringify({mode,newIndividuals:creates.length,couplesSplit:splits.length,dateCorrections:3,birthdayLinks:links.length}));
}
