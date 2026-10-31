import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function run({sql,mode,folder}) {
 const snapshot=JSON.parse(readFileSync(`${folder}/snapshot-after-confirmed.json`));
 const people=snapshot.persons.filter(p=>!p.merged_into);
 const person=name=>{const matches=people.filter(p=>p.full_name===name);assert.equal(matches.length,1,name);return matches[0].id;};
 const creates=[];
 const birthday=name=>{const b=snapshot.document_birthdays.find(b=>b.anniversary_type==='birthday'&&b.display_name===name);assert.ok(b,name);if(b.person_id)return b.person_id;if(!creates.some(p=>p.id===b.id))creates.push({id:b.id,name});return b.id;};
 const map=new Map([
 ['Rosana',person('Rosana Jané')],['Nayara',birthday('Nayara')],['Andréia',person('Andréia Martins')],['Jéssica',birthday('Jéssica')],
 ['Marcela (Cido)',birthday('Marcela da Silva Azevedo')],['Neusita',birthday('Neuzita')],['Doriani',birthday('Doriani')],['Maysa',person('Maysa Martins')],
 ['Camila (Cláudio)',birthday('Camila Meireles')],['Martinez',birthday('Martinez')],['Regiane',person('Regiane Martins')],['Natalia',person('Natália Gonçalves')],
 ['Duda',birthday('Duda')],['Arlete',birthday('Arlete')],['Ana Paula',person('Ana Paula Batista')],['Camila Diniz',person('Camila Zanirato')],
 ['Ivanete',birthday('Ivanete')],['Priscila (Adriano)',birthday('Priscila (Esposa do Adriano)')],['Jaqueline',person('Jaqueline Barros')],
 ['Dalcy',birthday('Dalcy')],['Mayra Prates',person('Mayra Prates')],['Marcella (Adriana)',person('Marcella Lisboa')],
 ['Fabiana (Ado)',birthday('Fabiana')],['Fernanda',birthday('Fernanda')],['Liegi',birthday('Liegi')],['Fabíola',person('Fabíola Jané')],
 ['Adriane',birthday('Adriane')],['Larissa',birthday('Larissa Magri')],['Pedro (Ado)',person('Pedro Prates')],['Cláudio',birthday('Cláudio')],
 ['Rudinei',person('Rudinei de Souza')],['Noemi',birthday('Noemi')],['Neto',birthday('Neto')],['Cido',birthday('José Aparecido Azevedo')],
 ['Walker',birthday('Walker')],['Luís',birthday('Luiz')],['Marcos Diogo',person('Marcos Diogo')],['Cleuzano',birthday('Cleuzano')],
 ['Adriana Lisboa',person('Adriana Lisboa')],['Mariele',birthday('Mariele')],['Danilo (Val)',person('Danilo Augusto')],
 ]);
 const updates=[];
 for(const roster of snapshot.duty_rosters){const after=structuredClone(roster.groups);for(const group of after)for(const member of group.members){const id=map.get(member.name);if(id){assert.ok(!member.person_id||member.person_id===id,member.name);member.person_id=id;}}updates.push({id:roster.id,before:roster.groups,after});}
 // Document-only people receive one person ID without inventing a birth year
 // or an authentication account. Ambiguous aliases remain unlinked.
 for(const name of ['Wladimir','Benalle','Maria Val (Domingo)','Edna (Esposa do Nylton)','Regina','Sérgio','Matheus','Nylton','Liliana','Luciano','Lívia (Filha do Antônio e Luana)','Maite','Paulo','Denise','Antonio Crepadi','Raila Conceição','Emerson','Maria Aparecida Borges','Kauan','Jade','Daniel','Leo','Artur','Eduardo'])birthday(name);
 const birthdayLinks=[['Ricardo (Marido da Jéssica)','Ricardo Alcarás'],['João Victor (Domingo)','João Vitor']].map(([name,target])=>({id:snapshot.document_birthdays.find(b=>b.display_name===name&&b.anniversary_type==='birthday').id,person:person(target)}));
 const batch={creates,updates,birthdayLinks};
 const fingerprint=createHash('sha256').update(JSON.stringify(batch)).digest('hex');
 writeFileSync(`${folder}/roster-link-plan.json`,JSON.stringify(batch,null,2));
 if(mode==='roster-plan'){console.log(JSON.stringify({newPeople:creates.length,linkedEntries:updates.reduce((n,r)=>n+r.after.flatMap(g=>g.members).filter(m=>m.person_id).length,0)}));return;}
 if(mode==='roster-apply')assert.equal(JSON.parse(readFileSync(`${folder}/roster-rehearsal.json`)).fingerprint,fingerprint);else assert.equal(mode,'roster-rehearse');
 const lit=value=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
 await sql(`begin;do $links$ declare batch jsonb:=${lit(batch)};item jsonb;actor uuid;begin
 perform pg_advisory_xact_lock(20261026);lock table public.persons,public.duty_rosters,public.document_birthdays in share row exclusive mode;
 select p.id into actor from public.persons p join public.role_assignments r on r.person_id=p.id where r.role='admin' and p.auth_user_id is not null and p.full_name not ilike '%fictício%' limit 1;
 if actor is null then raise exception 'Admin required';end if;
 for item in select * from jsonb_array_elements(batch->'creates') loop
  insert into public.persons(id,full_name) values((item->>'id')::uuid,item->>'name');
  update public.document_birthdays set person_id=(item->>'id')::uuid where id=(item->>'id')::uuid and person_id is null;
  if not found then raise exception 'Birthday changed';end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'birthdayLinks') loop
  update public.document_birthdays set person_id=(item->>'person')::uuid where id=(item->>'id')::uuid and person_id is null;
  if not found then raise exception 'Birthday changed';end if;
 end loop;
 for item in select * from jsonb_array_elements(batch->'updates') loop
  update public.duty_rosters set groups=item->'after' where id=(item->>'id')::uuid and groups=item->'before';
  if not found then raise exception 'Roster changed';end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'identity.roster_links',(item->>'id')::uuid);
 end loop;end $links$;${mode==='roster-rehearse'?'rollback':'commit'};`);
 if(mode==='roster-rehearse')writeFileSync(`${folder}/roster-rehearsal.json`,JSON.stringify({fingerprint,passed:true}));
 console.log(JSON.stringify({mode,newPeople:creates.length,linkedEntries:updates.reduce((n,r)=>n+r.after.flatMap(g=>g.members).filter(m=>m.person_id).length,0)}));
}
