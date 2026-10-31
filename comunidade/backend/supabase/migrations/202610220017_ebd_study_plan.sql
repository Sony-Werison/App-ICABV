alter table public.ebd_modules add column daily_limit integer not null default 0 check(daily_limit between 0 and 100);
alter table public.ebd_modules add column weekly_bible_limit integer not null default 0 check(weekly_bible_limit between 0 and 100);
alter table public.ebd_modules add column weekly_video_limit integer not null default 0 check(weekly_video_limit between 0 and 100);
create or replace function public.start_ebd_activity(activity uuid) returns timestamptz language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); result timestamptz; a public.ebd_activities; enrollment public.ebd_class_members;
begin
 select * into a from public.ebd_activities where id=activity and published and available_on<=(now() at time zone 'America/Sao_Paulo')::date and (due_on is null or due_on>=(now() at time zone 'America/Sao_Paulo')::date);
 select * into enrollment from public.ebd_class_members where class_id=private.ebd_activity_class(activity) and person_id=actor and role='student';
 if a.id is null or enrollment.person_id is null or (enrollment.module_id is not null and enrollment.module_id<>a.module_id) or exists(select 1 from public.ebd_modules m join public.ebd_classes c on c.id=m.class_id where m.id=a.module_id and (m.archived or c.archived)) then raise exception 'activity_unavailable' using errcode='42501';end if;
 insert into public.ebd_activity_starts(activity_id,person_id) values(activity,actor) on conflict do nothing;
 select started_at into result from public.ebd_activity_starts where activity_id=activity and person_id=actor;return result;
end $$;
alter function public.submit_ebd_activity(uuid,jsonb) set schema private;
alter function private.submit_ebd_activity(uuid,jsonb) rename to submit_ebd_response;
revoke all on function private.submit_ebd_response(uuid,jsonb) from public,anon,authenticated;
create function public.submit_ebd_activity(activity uuid,responses jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();a public.ebd_activities;m public.ebd_modules;daily integer;bible integer;video integer;day_start timestamptz;week_start timestamptz;
begin
 perform public.start_ebd_activity(activity);
 select * into a from public.ebd_activities where id=activity;
 select * into m from public.ebd_modules where id=a.module_id;
 perform 1 from public.ebd_class_members where class_id=m.class_id and person_id=actor for update;
 day_start:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 week_start:=date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 select count(*) filter(where s.created_at>=day_start),count(*) filter(where x.kind in ('bible','video_bible')),count(*) filter(where x.kind in ('video','video_bible')) into daily,bible,video
 from public.ebd_submissions s join public.ebd_activities x on x.id=s.activity_id where s.person_id=actor and x.module_id=m.id and s.created_at>=week_start;
 if (m.daily_limit>0 and daily>=m.daily_limit) or (m.weekly_bible_limit>0 and a.kind in ('bible','video_bible') and bible>=m.weekly_bible_limit) or (m.weekly_video_limit>0 and a.kind in ('video','video_bible') and video>=m.weekly_video_limit) then raise exception 'study_limit_reached';end if;
 return private.submit_ebd_response(activity,responses);
end $$;
revoke all on function public.submit_ebd_activity(uuid,jsonb) from public,anon;
grant execute on function public.submit_ebd_activity(uuid,jsonb) to authenticated;
create function public.advance_ebd_module(target_class uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();e public.ebd_class_members;
begin
 select * into e from public.ebd_class_members where class_id=target_class and person_id=actor and role='student' for update;
 if e.person_id is null or e.module_id is null or e.next_module_id is null then raise exception 'next_module_required';end if;
 if not exists(select 1 from public.ebd_activities a where a.module_id=e.module_id and a.published) or exists(select 1 from public.ebd_activities a where a.module_id=e.module_id and a.published and not exists(select 1 from public.ebd_submissions s where s.activity_id=a.id and s.person_id=actor)) then raise exception 'module_incomplete';end if;
 if not exists(select 1 from public.ebd_modules m where m.id=e.next_module_id and m.class_id=target_class and not m.archived) then raise exception 'next_module_required';end if;
 update public.ebd_class_members set module_id=e.next_module_id,next_module_id=null where class_id=target_class and person_id=actor;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'ebd.module_advanced',e.next_module_id);
end $$;
revoke all on function public.advance_ebd_module(uuid) from public,anon;
grant execute on function public.advance_ebd_module(uuid) to authenticated;
create or replace function public.import_module_backup(target_module text,bundle jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
   insert into public.ebd_modules(id,class_id,title,description,position,daily_limit,weekly_bible_limit,weekly_video_limit) values(id,cls,r->>'title',coalesce(r->>'description',''),coalesce((r->>'position')::int,0),coalesce((r->>'daily_limit')::int,0),coalesce((r->>'weekly_bible_limit')::int,0),coalesce((r->>'weekly_video_limit')::int,0)) on conflict do nothing;
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

