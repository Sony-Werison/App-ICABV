alter table public.worship_songs add column legacy_total integer not null default 0 check(legacy_total>=0);
alter table public.worship_songs add column legacy_quarterly integer not null default 0 check(legacy_quarterly>=0);
create table public.ebd_legacy_history (
 id uuid primary key, person_id uuid not null references public.persons(id), class_id uuid not null references public.ebd_classes(id),
 module_title text not null default '', title text not null, kind text not null default 'manual', question text not null default '', answer text not null default '',
 correct_answer text not null default '', score numeric check(score between 0 and 10), status text not null default 'pending',
 teacher_comment text not null default '', student_reply text not null default '', created_at timestamptz not null
);
alter table public.ebd_legacy_history enable row level security;
create policy ebd_history_read on public.ebd_legacy_history for select to authenticated using(private.ebd_student_access(person_id) or private.ebd_teacher(class_id) or private.ebd_observer());
revoke all on public.ebd_legacy_history from public,anon,authenticated;
grant select on public.ebd_legacy_history to authenticated;
create function private.import_module_id(m text,k text,legacy text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if legacy is null or length(legacy) not between 1 and 300 then raise exception 'invalid_legacy_id';end if;
 insert into public.legacy_mapping(source_system,entity_type,legacy_id,canonical_id) values(m,k,legacy,gen_random_uuid()) on conflict do nothing;
 select canonical_id into result from public.legacy_mapping where source_system=m and entity_type=k and legacy_id=legacy;return result;
end $$;
create function public.import_module_backup(target_module text,bundle jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<importer>>
declare actor uuid:=private.core_actor(); r jsonb; id uuid; chosen uuid; cls uuid; person uuid; song_ids uuid[]; assignments jsonb; entry record; ids jsonb; x text; result jsonb; count_people int:=0;
begin
 if target_module not in ('louvor','ebd') or not private.module_manager(target_module) then raise exception 'forbidden' using errcode='42501';end if;
 if length(bundle::text)>20000000 or jsonb_typeof(bundle)<>'object' then raise exception 'invalid_backup';end if;
 -- Serialize imports to preserve stable mappings and avoid duplicated records.
 perform pg_advisory_xact_lock(20261022);
 for r in select * from jsonb_array_elements(coalesce(bundle->'people','[]')) loop
  if length(trim(coalesce(r->>'name',''))) not between 2 and 120 then raise exception 'invalid_name';end if;
  select canonical_id into id from public.legacy_mapping where source_system=target_module and entity_type='person' and legacy_id=r->>'legacy_id';
  chosen:=nullif(r->>'person_id','')::uuid;
  if id is not null and chosen is not null and chosen<>id then raise exception 'mapping_conflict';end if;
  if id is null then
   if chosen is not null then
    if not exists(select 1 from public.persons where persons.id=chosen) then raise exception 'person_not_found';end if;id:=chosen;
   else insert into public.persons(full_name) values(trim(r->>'name')) returning persons.id into id;count_people:=count_people+1;end if;
   insert into public.legacy_mapping values(target_module,'person',r->>'legacy_id',id);
  end if;
  if target_module='louvor' then insert into public.worship_members(person_id,roles) values(id,array(select jsonb_array_elements_text(coalesce(r->'roles','[]')))) on conflict do nothing;end if;
  insert into public.person_contacts(person_id,email,phone) values(id,coalesce(r->>'email',''),coalesce(r->>'phone','')) on conflict do nothing;
 end loop;
 if target_module='louvor' then
  for r in select * from jsonb_array_elements(coalesce(bundle->'songs','[]')) loop
   id:=private.import_module_id('louvor','song',r->>'legacy_id');
   insert into public.worship_songs(id,title,artist,musical_key,category,is_new,youtube_url,lyrics,chords,bpm,pdf_links,legacy_total,legacy_quarterly)
   values(id,r->>'title',coalesce(r->>'artist',''),coalesce(r->>'musical_key','C'),coalesce(r->>'category','Louvor'),coalesce((r->>'is_new')::boolean,false),coalesce(r->>'youtube_url',''),coalesce(r->>'lyrics',''),coalesce(r->>'chords',''),coalesce((r->>'bpm')::int,80),coalesce(r->'pdf_links','[]'),coalesce((r->>'legacy_total')::int,0),coalesce((r->>'legacy_quarterly')::int,0)) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'services','[]')) loop
   id:=private.import_module_id('louvor','service',r->>'legacy_id');song_ids:='{}';assignments:='{}';
   for x in select jsonb_array_elements_text(coalesce(r->'playlist','[]')) loop
    select canonical_id into chosen from public.legacy_mapping where source_system='louvor' and entity_type='song' and legacy_id=x;
    if chosen is null or not exists(select 1 from public.worship_songs where worship_songs.id=chosen) then raise exception 'song_mapping_required';end if;song_ids:=array_append(song_ids,chosen);
   end loop;
   for entry in select * from jsonb_each(coalesce(r->'assignments','{}')) loop
    ids:='[]';for x in select jsonb_array_elements_text(entry.value) loop
     select canonical_id into chosen from public.legacy_mapping where source_system='louvor' and entity_type='person' and legacy_id=x;
     if chosen is null then raise exception 'person_mapping_required';end if;ids:=ids||jsonb_build_array(chosen);
    end loop;assignments:=assignments||jsonb_build_object(entry.key,ids);
   end loop;
   insert into public.worship_services(id,title,starts_at,period,assignments,playlist,featured,status) values(id,r->>'title',(r->>'starts_at')::timestamptz,r->>'period',assignments,song_ids,coalesce((r->>'featured')::boolean,false),coalesce(r->>'status','planned')) on conflict do nothing;
  end loop;
 else
  for r in select * from jsonb_array_elements(coalesce(bundle->'classes','[]')) loop
   id:=private.import_module_id('ebd','class',r->>'legacy_id');
   insert into public.ebd_classes(id,name,kind,criteria,include_saturday,report_style) values(id,r->>'name',coalesce(r->>'kind','youth'),array(select jsonb_array_elements_text(r->'criteria')),coalesce((r->>'include_saturday')::boolean,false),coalesce(r->>'report_style','marking')) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'modules','[]')) loop
   id:=private.import_module_id('ebd','module',r->>'legacy_id');cls:=private.import_module_id('ebd','class',r->>'class_legacy_id');
   insert into public.ebd_modules(id,class_id,title,description,position) values(id,cls,r->>'title',coalesce(r->>'description',''),coalesce((r->>'position')::int,0)) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'enrollments','[]')) loop
   select canonical_id into person from public.legacy_mapping where source_system='ebd' and entity_type='person' and legacy_id=r->>'person_legacy_id';
   if person is null then raise exception 'person_mapping_required';end if;
   cls:=private.import_module_id('ebd','class',r->>'class_legacy_id');
   chosen:=case when nullif(r->>'module_legacy_id','') is null then null else private.import_module_id('ebd','module',r->>'module_legacy_id') end;
   insert into public.ebd_class_members(class_id,person_id,role,module_id,next_module_id,reading_group_size) values(cls,person,r->>'role',chosen,case when nullif(r->>'next_module_legacy_id','') is null then null else private.import_module_id('ebd','module',r->>'next_module_legacy_id') end,coalesce((r->>'reading_group_size')::int,1)) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'guardians','[]')) loop
   select canonical_id into person from public.legacy_mapping where source_system='ebd' and entity_type='person' and legacy_id=r->>'student_legacy_id';
   select canonical_id into chosen from public.legacy_mapping where source_system='ebd' and entity_type='person' and legacy_id=r->>'guardian_legacy_id';
   if person is null or chosen is null then raise exception 'person_mapping_required';end if;
   insert into public.ebd_guardians values(person,chosen) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'activities','[]')) loop
   id:=private.import_module_id('ebd','activity',r->>'legacy_id');
   if not exists(select 1 from public.ebd_activities a where a.id=importer.id) then
    chosen:=private.import_module_id('ebd','module',r->>'module_legacy_id');
    perform public.save_ebd_activity(id,(r-'legacy_id'-'module_legacy_id'-'answer_key')||jsonb_build_object('module_id',chosen,'published',false),coalesce(r->'answer_key','{}'));
   end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'recordings','[]')) loop
   id:=private.import_module_id('ebd','recording',r->>'legacy_id');cls:=private.import_module_id('ebd','class',r->>'class_legacy_id');
   insert into public.ebd_recordings(id,class_id,title,lesson_date,teacher,url,published) values(id,cls,r->>'title',(r->>'lesson_date')::date,coalesce(r->>'teacher',''),r->>'url',false) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'attendance','[]')) loop
   id:=private.import_module_id('ebd','attendance',r->>'legacy_id');cls:=private.import_module_id('ebd','class',r->>'class_legacy_id');
   select canonical_id into person from public.legacy_mapping where source_system='ebd' and entity_type='person' and legacy_id=r->>'person_legacy_id';
   if person is null then raise exception 'person_mapping_required';end if;
   insert into public.ebd_attendance(id,class_id,person_id,lesson_date,present,criteria,score,note) values(id,cls,person,(r->>'lesson_date')::date,coalesce((r->>'present')::boolean,false),coalesce(r->'criteria','{}'),nullif(r->>'score','')::numeric,coalesce(r->>'note','')) on conflict do nothing;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(bundle->'history','[]')) loop
   id:=private.import_module_id('ebd','history',r->>'legacy_id');cls:=private.import_module_id('ebd','class',r->>'class_legacy_id');
   select canonical_id into person from public.legacy_mapping where source_system='ebd' and entity_type='person' and legacy_id=r->>'person_legacy_id';
   if person is null then raise exception 'person_mapping_required';end if;
   insert into public.ebd_legacy_history(id,person_id,class_id,module_title,title,kind,question,answer,correct_answer,score,status,teacher_comment,student_reply,created_at)
   values(id,person,cls,coalesce(r->>'module_title',''),r->>'title',coalesce(r->>'kind','manual'),coalesce(r->>'question',''),coalesce(r->>'answer',''),coalesce(r->>'correct_answer',''),nullif(r->>'score','')::numeric,coalesce(r->>'status','pending'),coalesce(r->>'teacher_comment',''),coalesce(r->>'student_reply',''),(r->>'created_at')::timestamptz) on conflict do nothing;
  end loop;
 end if;
 result:=jsonb_build_object('new_people',count_people,'module',target_module);
 insert into public.audit_log(actor_id,action) values(actor,target_module||'.backup_imported');
 return result;
end $$;
revoke all on function private.import_module_id(text,text,text) from public,anon,authenticated;
revoke all on function public.import_module_backup(text,jsonb) from public,anon;
grant execute on function public.import_module_backup(text,jsonb) to authenticated;
create function private.module_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare resource uuid;
begin
 resource:=coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid,(to_jsonb(new)->>'person_id')::uuid,(to_jsonb(old)->>'person_id')::uuid);
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),tg_table_name||'.'||lower(tg_op),resource);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
do $$declare t text;begin
 foreach t in array array['module_access','person_contacts','worship_members','worship_songs','worship_services','ebd_classes','ebd_class_members','ebd_guardians','ebd_modules','ebd_recordings','ebd_attendance'] loop
  execute format('create trigger module_audit after insert or update or delete on public.%I for each row execute function private.module_audit()',t);
 end loop;
end $$;
revoke all on function private.module_audit() from public,anon,authenticated;
create function public.grade_ebd_history(submission uuid,grade numeric,comment text) returns void language plpgsql security definer set search_path='' as $$
declare s public.ebd_legacy_history;
begin
 select * into s from public.ebd_legacy_history where id=submission for update;
 if s.id is null or not private.ebd_teacher(s.class_id) then raise exception 'forbidden' using errcode='42501';end if;
 if grade is null or grade not between 0 and 10 then raise exception 'invalid_score';end if;
 update public.ebd_legacy_history set score=grade,status='graded',teacher_comment=coalesce(comment,'') where id=submission;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'ebd.history_graded',submission);
end $$;
create function public.reply_ebd_history(submission uuid,reply text) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(reply)>6000 then raise exception 'invalid_reply';end if;
 update public.ebd_legacy_history set student_reply=reply where id=submission and person_id=private.core_actor();
 if not found then raise exception 'forbidden' using errcode='42501';end if;
end $$;
revoke all on function public.grade_ebd_history(uuid,numeric,text),public.reply_ebd_history(uuid,text) from public,anon;
grant execute on function public.grade_ebd_history(uuid,numeric,text),public.reply_ebd_history(uuid,text) to authenticated;
