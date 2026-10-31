-- Imported answers participate in the current study plan without becoming new submissions.
create or replace function public.advance_ebd_module(target_class uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); e public.ebd_class_members;
begin
 select * into e from public.ebd_class_members where class_id=target_class and person_id=actor and role='student' for update;
 if e.person_id is null or e.module_id is null or e.next_module_id is null then raise exception 'next_module_required'; end if;
 if not exists(select 1 from public.ebd_activities a where a.module_id=e.module_id and a.published)
 or exists(select 1 from public.ebd_activities a where a.module_id=e.module_id and a.published
   and not exists(select 1 from public.ebd_submissions s where s.activity_id=a.id and s.person_id=actor)
   and not exists(select 1 from public.ebd_legacy_history h where h.activity_id=a.id and h.person_id=actor))
 then raise exception 'module_incomplete'; end if;
 if not exists(select 1 from public.ebd_modules m where m.id=e.next_module_id and m.class_id=target_class and not m.archived) then raise exception 'next_module_required'; end if;
 update public.ebd_class_members set module_id=e.next_module_id,next_module_id=null where class_id=target_class and person_id=actor;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'ebd.module_advanced',e.next_module_id);
end $$;

create or replace function public.submit_ebd_activity(activity uuid,responses jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); a public.ebd_activities; m public.ebd_modules; daily integer; bible integer; video integer; day_start timestamptz; week_start timestamptz;
begin
 perform public.start_ebd_activity(activity);
 select * into a from public.ebd_activities where id=activity;
 select * into m from public.ebd_modules where id=a.module_id;
 perform 1 from public.ebd_class_members where class_id=m.class_id and person_id=actor for update;
 day_start:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 week_start:=date_trunc('week',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 with history as (
  select s.activity_id,s.created_at from public.ebd_submissions s where s.person_id=actor and s.created_at>=week_start
  union all
  select h.activity_id,h.created_at from public.ebd_legacy_history h where h.person_id=actor and h.created_at>=week_start and h.activity_id is not null
 )
 select count(distinct h.activity_id) filter(where h.created_at>=day_start),
 count(distinct h.activity_id) filter(where x.kind in ('bible','video_bible')),
 count(distinct h.activity_id) filter(where x.kind in ('video','video_bible')) into daily,bible,video
 from history h join public.ebd_activities x on x.id=h.activity_id where x.module_id=m.id;
 if (m.daily_limit>0 and daily>=m.daily_limit) or (m.weekly_bible_limit>0 and a.kind in ('bible','video_bible') and bible>=m.weekly_bible_limit) or (m.weekly_video_limit>0 and a.kind in ('video','video_bible') and video>=m.weekly_video_limit) then raise exception 'study_limit_reached'; end if;
 return private.submit_ebd_response(activity,responses);
end $$;
revoke all on function public.advance_ebd_module(uuid),public.submit_ebd_activity(uuid,jsonb) from public,anon;
grant execute on function public.advance_ebd_module(uuid),public.submit_ebd_activity(uuid,jsonb) to authenticated;
