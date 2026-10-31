-- Faithful real-data migration: preserve original grades, identities, removed IDs and lesson records.
create table public.legacy_person_records (
 source_system text not null check(source_system in ('ebd','louvor')), legacy_id text not null,
 person_id uuid not null references public.persons(id), source_data jsonb not null,
 primary key(source_system,legacy_id)
);
alter table public.legacy_person_records enable row level security;
create policy legacy_person_read on public.legacy_person_records for select to authenticated using(person_id=private.person_id() or private.manage_people());
revoke all on public.legacy_person_records from public,anon,authenticated;
grant select on public.legacy_person_records to authenticated;
alter table public.ebd_legacy_history add column score_original numeric;
alter table public.ebd_legacy_history add column score_scale numeric;
alter table public.ebd_legacy_history add column teacher_id uuid references public.persons(id);
alter table public.ebd_legacy_history add column activity_id uuid references public.ebd_activities(id);
alter table public.ebd_legacy_history add column source_data jsonb not null default '{}';
create index ebd_legacy_activity_person on public.ebd_legacy_history(activity_id,person_id);
alter table public.ebd_recordings drop constraint ebd_recordings_url_check;
alter table public.ebd_recordings add check(url='' or url~'^https://');
alter table public.ebd_recordings add column status text not null default 'normal' check(status in ('normal','canceled'));
alter table public.ebd_recordings add column justification text not null default '';
alter table public.ebd_recordings add column source_data jsonb not null default '{}';
create table public.module_import_runs (
 id uuid primary key, plan_hash text not null, actor_id uuid references public.persons(id),
 summary jsonb not null, created_at timestamptz not null default now()
);
alter table public.module_import_runs enable row level security;
create policy import_runs_read on public.module_import_runs for select to authenticated using(private.has_role(array['admin']));
revoke all on public.module_import_runs from public,anon,authenticated;
grant select on public.module_import_runs to authenticated;

create or replace function private.validate_worship_service() returns trigger language plpgsql security definer set search_path='' as $$
declare v text; ids jsonb; previous jsonb;
begin
 if exists(select 1 from unnest(new.playlist) i where not exists(select 1 from public.worship_songs s where s.id=i)) then raise exception 'invalid_playlist';end if;
 if tg_op='UPDATE' then previous:=old.assignments;else previous:='{}';end if;
 for v,ids in select * from jsonb_each(new.assignments) loop
  if length(v)>80 or jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)>50 then raise exception 'invalid_assignments';end if;
  if exists(select 1 from jsonb_array_elements_text(ids) i where not exists(select 1 from public.worship_members m where m.person_id::text=i and (m.active or exists(select 1 from jsonb_each(previous) old_role,jsonb_array_elements_text(old_role.value) old_id where old_id.value=i)))) then raise exception 'invalid_member';end if;
 end loop;return new;
end $$;
create function private.guard_legacy_submission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.ebd_legacy_history h where h.activity_id=new.activity_id and h.person_id=new.person_id) then raise exception 'already_submitted';end if;
 return new;
end $$;
create trigger legacy_submission_guard before insert on public.ebd_submissions for each row execute function private.guard_legacy_submission();
revoke all on function private.guard_legacy_submission() from public,anon,authenticated;

create function public.import_reconciled_modules(plan jsonb) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
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
  update public.ebd_activities set published=coalesce((r->>'published')::boolean,false) where id=identifier;
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
revoke all on function public.import_reconciled_modules(jsonb) from public,anon;
grant execute on function public.import_reconciled_modules(jsonb) to authenticated;
create or replace function private.ebd_class_access(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.ebd_observer() or private.ebd_teacher(c) or exists(select 1 from public.ebd_class_members where class_id=c and private.ebd_student_access(person_id)) or exists(select 1 from public.ebd_legacy_history where class_id=c and private.ebd_student_access(person_id))
$$;
create or replace function public.ebd_directory(target_class uuid) returns table(person_id uuid,full_name text,role text,module_id uuid,next_module_id uuid,reading_group_size integer) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.ebd_class_access(target_class) then raise exception 'forbidden' using errcode='42501';end if;
 return query
 select m.person_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),m.role,m.module_id,m.next_module_id,m.reading_group_size from public.ebd_class_members m join public.persons p on p.id=m.person_id
 where m.class_id=target_class and (private.ebd_observer() or private.ebd_teacher(target_class) or private.ebd_student_access(m.person_id))
 union all
 select distinct h.person_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),'historical'::text,null::uuid,null::uuid,1 from public.ebd_legacy_history h join public.persons p on p.id=h.person_id
 where h.class_id=target_class and (private.ebd_observer() or private.ebd_teacher(target_class) or private.ebd_student_access(h.person_id)) and not exists(select 1 from public.ebd_class_members m where m.class_id=target_class and m.person_id=h.person_id);
end $$;
