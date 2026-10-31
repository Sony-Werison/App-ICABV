-- Preserve the curriculum order instead of sorting same-day activities by random UUID.
alter table public.ebd_activities add column position integer not null default 0 check(position between 0 and 100000);
update public.ebd_activities a set position=substring(m.legacy_id from ':([0-9]+)$')::integer
from public.legacy_mapping m where m.source_system='ebd' and m.entity_type='activity' and m.canonical_id=a.id and m.legacy_id ~ '^.*:[^:]+:[0-9]+$';
create or replace function public.save_ebd_activity(resource uuid,data jsonb,answer_key jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; m public.ebd_modules; q jsonb; idx integer:=0;
begin
 select * into m from public.ebd_modules where id=(data->>'module_id')::uuid;
 if m.id is null or not private.ebd_teacher(m.class_id) then raise exception 'forbidden' using errcode='42501';end if;
 if resource is not null and not private.ebd_teacher(private.ebd_activity_class(resource)) then raise exception 'forbidden' using errcode='42501';end if;
 if jsonb_typeof(answer_key)<>'object' or jsonb_typeof(data->'questions')<>'array' then raise exception 'invalid_questions';end if;
 for q in select * from jsonb_array_elements(data->'questions') loop
  if jsonb_typeof(q)<>'object' or length(coalesce(q->>'prompt','')) not between 1 and 2000 or coalesce(q->>'type','text') not in ('text','choice') then raise exception 'invalid_questions';end if;
  if q->>'type'='choice' then
   if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'invalid_options';end if;
   if jsonb_array_length(q->'options') not between 2 and 10 or not (answer_key ? idx::text) or (answer_key->>idx::text)::int not between 0 and jsonb_array_length(q->'options')-1 then raise exception 'invalid_options';end if;
  end if;
  idx:=idx+1;
 end loop;
 insert into public.ebd_activities(id,module_id,title,kind,body,passages,video_url,questions,available_on,due_on,published,minimum_seconds,position)
 values(coalesce(resource,gen_random_uuid()),m.id,data->>'title',data->>'kind',coalesce(data->>'body',''),coalesce(data->>'passages',''),coalesce(data->>'video_url',''),data->'questions',coalesce(nullif(data->>'available_on','')::date,current_date),nullif(data->>'due_on','')::date,coalesce((data->>'published')::boolean,false),coalesce((data->>'minimum_seconds')::int,0),coalesce((data->>'position')::int,0))
 on conflict(id) do update set module_id=excluded.module_id,title=excluded.title,kind=excluded.kind,body=excluded.body,passages=excluded.passages,video_url=excluded.video_url,questions=excluded.questions,available_on=excluded.available_on,due_on=excluded.due_on,published=excluded.published,minimum_seconds=excluded.minimum_seconds,position=excluded.position returning id into result;
 insert into public.ebd_activity_keys(activity_id,answers) values(result,answer_key) on conflict(activity_id) do update set answers=excluded.answers;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'ebd.activity_saved',result);
 return result;
end $$;
create or replace function public.import_reconciled_modules(plan jsonb) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare actor uuid:=private.core_actor();run uuid:=(plan->>'run_id')::uuid;previous public.module_import_runs;p jsonb;ref jsonb;r jsonb;identifier uuid;meta jsonb;result jsonb;
begin
 if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501';end if;
 if length(plan::text)>40000000 or length(coalesce(plan->>'plan_hash',''))<>64 then raise exception 'invalid_plan';end if;
 perform pg_advisory_xact_lock(20261022);
 select * into previous from public.module_import_runs where id=run;
 if previous.id is not null then
  if previous.plan_hash<>plan->>'plan_hash' then raise exception 'plan_conflict';end if;return previous.summary;
 end if;
 -- Reconciliation is explicit, never inferred from an email or name on the server.
 for p in select * from jsonb_array_elements(plan->'people') loop
  identifier:=(p->>'canonical_id')::uuid;
  if length(trim(coalesce(p->>'name',''))) not between 2 and 120 then raise exception 'invalid_name';end if;
  insert into public.persons(id,full_name) values(identifier,trim(p->>'name')) on conflict(id) do nothing;
  update public.persons set full_name=trim(p->>'name') where id=identifier and full_name='';
  insert into public.person_contacts(person_id,email,phone,birth_date,avatar_url) values(identifier,coalesce(p->>'email',''),coalesce(p->>'phone',''),nullif(p->>'birth_date','')::date,coalesce(p->>'avatar_url',''))
   on conflict(person_id) do update set email=case when person_contacts.email='' then excluded.email else person_contacts.email end,phone=case when person_contacts.phone='' then excluded.phone else person_contacts.phone end,birth_date=coalesce(person_contacts.birth_date,excluded.birth_date),avatar_url=case when person_contacts.avatar_url='' then excluded.avatar_url else person_contacts.avatar_url end;
  for ref in select * from jsonb_array_elements(p->'references') loop
   insert into public.legacy_person_records(source_system,legacy_id,person_id,source_data) values(ref->>'source_system',ref->>'legacy_id',identifier,coalesce(ref->'source_data','{}')) on conflict do nothing;
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(plan->'mappings') item join public.legacy_mapping m on m.source_system=item->>'source_system' and m.entity_type=item->>'entity_type' and m.legacy_id=item->>'legacy_id' where m.canonical_id<>(item->>'canonical_id')::uuid) then raise exception 'mapping_conflict';end if;
 insert into public.legacy_mapping(source_system,entity_type,legacy_id,canonical_id)
 select item->>'source_system',item->>'entity_type',item->>'legacy_id',(item->>'canonical_id')::uuid from jsonb_array_elements(plan->'mappings') item on conflict do nothing;
 if plan ? 'louvor' then perform public.import_module_backup('louvor',plan->'louvor');end if;
 if plan ? 'ebd' then perform public.import_module_backup('ebd',plan->'ebd');end if;
 -- Provenance fields are retained separately from the normalized values used by the app.
 for r in select * from jsonb_array_elements(coalesce(plan->'ebd'->'classes','[]')) loop
  identifier:=private.import_module_id('ebd','class',r->>'legacy_id');
  update public.ebd_classes set start_date=coalesce(nullif(r->>'start_date','')::date,start_date),archived=coalesce((r->>'archived')::boolean,false),whatsapp_template=coalesce(nullif(r->>'whatsapp_template',''),whatsapp_template) where id=identifier;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(plan->'ebd'->'activities','[]')) loop
  identifier:=private.import_module_id('ebd','activity',r->>'legacy_id');
  update public.ebd_activities set published=coalesce((r->>'published')::boolean,false),position=coalesce((r->>'position')::integer,position) where id=identifier;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(plan->'ebd'->'recordings','[]')) loop
  identifier:=private.import_module_id('ebd','recording',r->>'legacy_id');
  update public.ebd_recordings set published=coalesce((r->>'published')::boolean,false),status=coalesce(r->>'status','normal'),justification=coalesce(r->>'justification',''),source_data=coalesce(r->'source_data','{}') where id=identifier;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(plan->'ebd'->'history','[]')) loop
  identifier:=private.import_module_id('ebd','history',r->>'legacy_id');
  update public.ebd_legacy_history set score_original=nullif(r->>'score_original','')::numeric,score_scale=nullif(r->>'score_scale','')::numeric,teacher_id=nullif(r->>'teacher_id','')::uuid,source_data=coalesce(r->'source_data','{}'),activity_id=case when nullif(r->>'activity_legacy_id','') is null then null else private.import_module_id('ebd','activity',r->>'activity_legacy_id') end where id=identifier;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(plan->'observers','[]')) loop
  insert into public.module_access(person_id,module,role) values((r->>'person_id')::uuid,'ebd','observer') on conflict do nothing;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(plan->'removed_music_people','[]')) loop
  update public.worship_members set active=false where person_id=(r#>>'{}')::uuid;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(plan->'rehearsals','[]')) loop
  insert into public.worship_rehearsals(id,person_id,title,playlist) values((r->>'id')::uuid,(r->>'person_id')::uuid,r->>'title',array(select jsonb_array_elements_text(r->'playlist'))::uuid[]) on conflict do nothing;
 end loop;
 result:=coalesce(plan->'summary','{}')||jsonb_build_object('run_id',run,'applied',true);
 insert into public.module_import_runs(id,plan_hash,actor_id,summary) values(run,plan->>'plan_hash',actor,result);
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'modules.real_import_applied',run);
 return result;
end $$;
