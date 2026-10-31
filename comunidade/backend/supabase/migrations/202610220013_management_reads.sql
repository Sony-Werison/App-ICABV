-- Administrative reads use the same scoped actor as administrative writes.
-- Unit membership, leadership, private fields and pagination checks remain intact.

create or replace function public.group_meeting_page(unit uuid,page integer) returns table(id uuid,title text,topic text,location text,starts_at timestamptz,ends_at timestamptz,status text,my_status text,my_present boolean,going_count bigint,present_count bigint)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.management_actor();manager boolean:=private.unit_manager(unit);
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

create or replace function public.group_meeting_roster(meeting uuid,page integer) returns table(person_id uuid,full_name text,status text,present boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.management_actor();
 if not exists(select 1 from public.group_meetings m where m.id=meeting and private.unit_manager(m.unit_id)) then raise exception 'unauthorized' using errcode='42501'; end if;
 if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
 return query select p.person_id,n.full_name,p.status,p.present from public.group_meeting_participants p join public.persons n on n.id=p.person_id where p.meeting_id=meeting order by n.full_name,p.person_id limit 21 offset page*20;
end $$;

create or replace function public.group_meeting_report(unit uuid,year integer) returns table(planned bigint,held bigint,canceled bigint,confirmations bigint,presences bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.management_actor();
 if not private.unit_manager(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
 if year is null or year<2000 or year>2100 then raise exception 'invalid_year'; end if;
 return query with scope as (select m.* from public.group_meetings m where m.unit_id=unit and m.starts_at>=make_timestamptz(year,1,1,0,0,0,'America/Sao_Paulo') and m.starts_at<make_timestamptz(year+1,1,1,0,0,0,'America/Sao_Paulo'))
 select (select count(*) from scope where status='published' and starts_at>now()),
 (select count(*) from scope where status='published' and ends_at<=now()),
 (select count(*) from scope where status='canceled'),
 (select count(*) from public.group_meeting_participants p join scope m on m.id=p.meeting_id where m.status='published' and p.status='going'),
 (select count(*) from public.group_meeting_participants p join scope m on m.id=p.meeting_id where m.status='published' and p.present);
end $$;

create or replace function public.group_chat_page(unit uuid,cursor_id uuid,review boolean)
returns table(id uuid,body text,author_name text,created_at timestamptz,status text,is_mine boolean,report_count bigint,report_reasons text[])
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.management_actor();manager boolean:=private.unit_manager(unit);anchor public.group_chat_messages;
begin
 if not private.group_chat_access(unit) or review is null or (review and not manager) then raise exception 'unauthorized' using errcode='42501'; end if;
 if cursor_id is not null then
  select * into anchor from public.group_chat_messages m where m.id=cursor_id and m.unit_id=unit and (manager or m.status='published' or m.author_id=actor or (m.status='withdrawn' and m.ever_published));
  if not found then raise exception 'invalid_cursor'; end if;
 end if;
 return query select m.id,case when m.status='withdrawn' then null else m.body end,case when m.status='withdrawn' then null else p.full_name end,m.created_at,m.status,m.author_id=actor,
 case when manager then (select count(*) from public.group_chat_reports r where r.message_id=m.id) else null end,
 case when manager then (select array_agg(distinct r.reason order by r.reason) from public.group_chat_reports r where r.message_id=m.id) else null end
 from public.group_chat_messages m join public.persons p on p.id=m.author_id
 where m.unit_id=unit and (cursor_id is null or (m.created_at,m.id)<(anchor.created_at,anchor.id))
 and ((review and (m.status in ('pending','hidden') or (m.status='published' and exists(select 1 from public.group_chat_reports r where r.message_id=m.id))))
 or (not review and (m.status='published' or m.author_id=actor or (m.status='withdrawn' and m.ever_published))))
 order by m.created_at desc,m.id desc limit 21;
end $$;

create or replace function public.service_exchange_page(page integer)
returns table(id uuid,title text,unit_title text,starts_at timestamptz,ends_at timestamptz,status text,is_source boolean,is_target boolean,can_manage boolean,available boolean,source_name text,target_name text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.management_actor();
begin
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select e.id,s.title,u.title,s.starts_at,s.ends_at,e.status,e.source_id=actor,coalesce(e.target_id=actor,false),private.unit_manager(u.id),
    not s.canceled and s.starts_at>now() and s.starts_at=e.starts_at and s.ends_at=e.ends_at and a.status='confirmed' and a.person_id=e.source_id
      and exists(select 1 from public.community_members m where m.unit_id=u.id and m.person_id=e.source_id and m.status='active')
      and (e.target_id is null or (exists(select 1 from public.community_members m where m.unit_id=u.id and m.person_id=e.target_id and m.status='active') and not exists(select 1 from public.service_assignments x where x.shift_id=s.id and x.person_id=e.target_id and x.status<>'declined'))),
    case when private.unit_manager(u.id) then p.full_name else null end,
    case when private.unit_manager(u.id) then t.full_name else null end
  from public.service_exchanges e join public.service_assignments a on a.id=e.assignment_id join public.service_shifts s on s.id=a.shift_id join public.community_units u on u.id=s.unit_id join public.persons p on p.id=e.source_id left join public.persons t on t.id=e.target_id
  where e.source_id=actor or e.target_id=actor or private.unit_manager(u.id)
    or (e.status='open' and not s.canceled and s.starts_at>now() and s.starts_at=e.starts_at and s.ends_at=e.ends_at and a.status='confirmed'
      and private.unit_active(u.id,actor)
      and exists(select 1 from public.community_members m where m.unit_id=u.id and m.person_id=e.source_id and m.status='active')
      and not exists(select 1 from public.service_assignments x where x.shift_id=s.id and x.person_id=actor and x.status<>'declined'))
  order by e.created_at desc,e.id limit 21 offset page*20;
end $$;
