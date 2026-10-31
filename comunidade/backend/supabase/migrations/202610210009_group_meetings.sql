-- Group meetings/studies: scoped planning and attendance, no pastoral notes.
create table public.group_meetings (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.community_units(id),
 title text not null check(length(trim(title)) between 2 and 160), topic text not null default '' check(length(topic)<=1000),
 location text not null default '' check(length(location)<=240), starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'draft' check(status in ('draft','published','canceled')), check(ends_at>starts_at)
);
create index group_meetings_unit on public.group_meetings(unit_id,starts_at,id);
create table public.group_meeting_participants (
 meeting_id uuid not null references public.group_meetings(id), person_id uuid not null references public.persons(id),
 status text not null check(status in ('going','canceled')), present boolean not null default false,
 primary key(meeting_id,person_id),check(not present or status='going')
);
alter table public.group_meetings enable row level security;
alter table public.group_meeting_participants enable row level security;
revoke all on public.group_meetings,public.group_meeting_participants from anon,authenticated;

create function public.save_group_meeting(resource uuid,unit uuid,title text,topic text,location text,starts_at timestamptz,ends_at timestamptz,status text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();old public.group_meetings;result uuid;
begin
 if not private.unit_manager(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
 perform 1 from public.community_units u where u.id=unit and u.kind='group' for update;
 if not found then raise exception 'group_required'; end if;
 if status is null or status not in ('draft','published','canceled') or starts_at is null or ends_at is null then raise exception 'invalid_data'; end if;
 if resource is not null then
  select * into old from public.group_meetings m where m.id=resource and m.unit_id=unit for update;
  if not found then raise exception 'meeting_unavailable'; end if;
  if old.status='canceled' then raise exception 'meeting_closed'; end if;
  if old.starts_at<=now() and (starts_at<>old.starts_at or ends_at<>old.ends_at or status<>old.status) then raise exception 'meeting_started'; end if;
  if old.starts_at>now() and starts_at<=now() then raise exception 'future_required'; end if;
  if old.status='published' and (status='draft' or starts_at<>old.starts_at or ends_at<>old.ends_at or trim(location)<>old.location) and exists(select 1 from public.group_meeting_participants p where p.meeting_id=resource and p.status='going') then raise exception 'participants_exist'; end if;
 else
  if starts_at<=now() or status='canceled' then raise exception 'future_required'; end if;
 end if;
 insert into public.group_meetings(id,unit_id,title,topic,location,starts_at,ends_at,status) values(coalesce(resource,gen_random_uuid()),unit,trim(title),trim(topic),trim(location),starts_at,ends_at,status)
 on conflict(id) do update set title=excluded.title,topic=excluded.topic,location=excluded.location,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status returning id into result;
 if status='canceled' then update public.group_meeting_participants set status='canceled',present=false where meeting_id=result; end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.meeting_saved',result);return result;
end $$;

create function public.group_meeting_page(unit uuid,page integer) returns table(id uuid,title text,topic text,location text,starts_at timestamptz,ends_at timestamptz,status text,my_status text,my_present boolean,going_count bigint,present_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.core_actor();manager boolean:=private.unit_manager(unit);
begin
 if not manager and not private.unit_active(unit,actor) then raise exception 'unauthorized' using errcode='42501'; end if;
 if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
 return query select m.id,m.title,m.topic,m.location,m.starts_at,m.ends_at,m.status,p.status,coalesce(p.present,false),
 case when manager then (select count(*) from public.group_meeting_participants x where x.meeting_id=m.id and x.status='going') else null end,
 case when manager then (select count(*) from public.group_meeting_participants x where x.meeting_id=m.id and x.present) else null end
 from public.group_meetings m left join public.group_meeting_participants p on p.meeting_id=m.id and p.person_id=actor
 where m.unit_id=unit and (manager or m.status='published' or (m.status='canceled' and p.person_id=actor))
 order by m.starts_at desc,m.id limit 21 offset page*20;
end $$;

create function public.respond_group_meeting(meeting uuid,participate boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();m public.group_meetings;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_meetings where id=meeting) for update;
 select * into m from public.group_meetings where id=meeting for update;
 if not found or not private.unit_active(m.unit_id,actor) then raise exception 'unauthorized' using errcode='42501'; end if;
 if participate is null or m.status<>'published' or m.starts_at<=now() then raise exception 'meeting_closed'; end if;
 insert into public.group_meeting_participants(meeting_id,person_id,status) values(meeting,actor,case when participate then 'going' else 'canceled' end)
 on conflict(meeting_id,person_id) do update set status=excluded.status,present=false;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.meeting_response',meeting);
end $$;

create function public.group_meeting_roster(meeting uuid,page integer) returns table(person_id uuid,full_name text,status text,present boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.core_actor();
 if not exists(select 1 from public.group_meetings m where m.id=meeting and private.unit_manager(m.unit_id)) then raise exception 'unauthorized' using errcode='42501'; end if;
 if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
 return query select p.person_id,n.full_name,p.status,p.present from public.group_meeting_participants p join public.persons n on n.id=p.person_id where p.meeting_id=meeting order by n.full_name,p.person_id limit 21 offset page*20;
end $$;

create function public.set_group_meeting_attendance(meeting uuid,person uuid,present boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();m public.group_meetings;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_meetings where id=meeting) for update;
 select * into m from public.group_meetings where id=meeting for update;
 if not found or not private.unit_manager(m.unit_id) then raise exception 'unauthorized' using errcode='42501'; end if;
 if present is null or m.status<>'published' or m.starts_at>now() then raise exception 'attendance_unavailable'; end if;
 update public.group_meeting_participants p set present=set_group_meeting_attendance.present where p.meeting_id=meeting and p.person_id=person and p.status='going';
 if not found then raise exception 'confirmation_required'; end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.meeting_attendance',meeting);
end $$;

create function public.group_meeting_report(unit uuid,year integer) returns table(planned bigint,held bigint,canceled bigint,confirmations bigint,presences bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.core_actor();
 if not private.unit_manager(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
 if year is null or year<2000 or year>2100 then raise exception 'invalid_year'; end if;
 return query with scope as (select m.* from public.group_meetings m where m.unit_id=unit and m.starts_at>=make_timestamptz(year,1,1,0,0,0,'America/Sao_Paulo') and m.starts_at<make_timestamptz(year+1,1,1,0,0,0,'America/Sao_Paulo'))
 select (select count(*) from scope where status='published' and starts_at>now()),
 (select count(*) from scope where status='published' and ends_at<=now()),
 (select count(*) from scope where status='canceled'),
 (select count(*) from public.group_meeting_participants p join scope m on m.id=p.meeting_id where m.status='published' and p.status='going'),
 (select count(*) from public.group_meeting_participants p join scope m on m.id=p.meeting_id where m.status='published' and p.present);
end $$;
revoke all on function public.save_group_meeting(uuid,uuid,text,text,text,timestamptz,timestamptz,text),public.group_meeting_page(uuid,integer),public.respond_group_meeting(uuid,boolean),public.group_meeting_roster(uuid,integer),public.set_group_meeting_attendance(uuid,uuid,boolean),public.group_meeting_report(uuid,integer) from public,anon;
grant execute on function public.save_group_meeting(uuid,uuid,text,text,text,timestamptz,timestamptz,text),public.group_meeting_page(uuid,integer),public.respond_group_meeting(uuid,boolean),public.group_meeting_roster(uuid,integer),public.set_group_meeting_attendance(uuid,uuid,boolean),public.group_meeting_report(uuid,integer) to authenticated;

-- Leaving a unit cancels only future confirmations, preserving past attendance.
create or replace function private.deactivate_unit_member(unit uuid,person uuid) returns void language plpgsql security definer set search_path='' as $$
declare shift record;meeting record;
begin
 for shift in select id from public.service_shifts where unit_id=unit and starts_at>now() order by id for update loop
  update public.service_assignments set status='declined',attended=false where shift_id=shift.id and person_id=person;
 end loop;
 for meeting in select id from public.group_meetings where unit_id=unit and starts_at>now() order by id for update loop
  update public.group_meeting_participants set status='canceled',present=false where meeting_id=meeting.id and person_id=person;
 end loop;
end $$;
