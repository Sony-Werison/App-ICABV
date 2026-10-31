-- Phase 4: moderated replacement of a confirmed future assignment.
create table public.service_exchanges (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.service_assignments(id),
  source_id uuid not null references public.persons(id),
  target_id uuid references public.persons(id),
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'open' check(status in ('open','accepted','approved','rejected','canceled')),
  created_at timestamptz not null default now(),
  check(source_id is distinct from target_id),
  check(status not in ('accepted','approved') or target_id is not null)
);
create unique index service_exchange_active on public.service_exchanges(assignment_id) where status in ('open','accepted');
create index service_exchange_target on public.service_exchanges(target_id,created_at,id);
alter table public.service_exchanges enable row level security;
revoke all on public.service_exchanges from anon,authenticated;

create function public.request_service_exchange(assignment uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();a public.service_assignments;s public.service_shifts;result uuid;
begin
  perform 1 from public.community_units where id=(select sh.unit_id from public.service_shifts sh join public.service_assignments x on x.shift_id=sh.id where x.id=assignment) for update;
  select sh.* into s from public.service_shifts sh join public.service_assignments x on x.shift_id=sh.id where x.id=assignment for update of sh;
  select * into a from public.service_assignments where id=assignment and person_id=actor for update;
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
  if s.canceled or s.starts_at<=now() or a.status<>'confirmed' then raise exception 'shift_closed'; end if;
  if not private.unit_active(s.unit_id,actor) then raise exception 'active_membership_required'; end if;
  select id into result from public.service_exchanges where assignment_id=assignment and status in ('open','accepted');
  if found then return result; end if;
  insert into public.service_exchanges(assignment_id,source_id,starts_at,ends_at) values(assignment,actor,s.starts_at,s.ends_at) returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.exchange_requested',result);
  return result;
end $$;

create function public.service_exchange_action(exchange uuid,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();e public.service_exchanges;s public.service_shifts;a public.service_assignments;
begin
  -- Same order as membership/assignment operations: unit, shift, assignment, exchange.
  perform 1 from public.community_units where id=(select sh.unit_id from public.service_shifts sh join public.service_assignments x on x.shift_id=sh.id join public.service_exchanges r on r.assignment_id=x.id where r.id=exchange) for update;
  select sh.* into s from public.service_shifts sh join public.service_assignments x on x.shift_id=sh.id join public.service_exchanges r on r.assignment_id=x.id where r.id=exchange for update of sh;
  select x.* into a from public.service_assignments x join public.service_exchanges r on r.assignment_id=x.id where r.id=exchange for update of x;
  select * into e from public.service_exchanges where id=exchange for update;
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
  if e.status not in ('open','accepted') then raise exception 'exchange_closed'; end if;
  if decision='cancel' and e.source_id=actor then
    update public.service_exchanges set status='canceled' where id=exchange;
  elsif decision='withdraw' and e.target_id=actor and e.status='accepted' then
    update public.service_exchanges set status='open',target_id=null where id=exchange;
  elsif decision='reject' and private.unit_manager(s.unit_id) then
    update public.service_exchanges set status='rejected' where id=exchange;
  elsif decision in ('accept','approve') then
    if decision='accept' then
      if e.status<>'open' or e.source_id=actor or not private.unit_active(s.unit_id,actor) then raise exception 'unauthorized' using errcode='42501'; end if;
    else
      if not private.unit_manager(s.unit_id) or actor in (e.source_id,e.target_id) then raise exception 'unauthorized' using errcode='42501'; end if;
      if e.status<>'accepted' then raise exception 'acceptance_required'; end if;
    end if;
    if s.canceled or s.starts_at<=now() or s.starts_at<>e.starts_at or s.ends_at<>e.ends_at or a.status<>'confirmed' or a.person_id<>e.source_id then raise exception 'exchange_unavailable'; end if;
    if not exists(select 1 from public.community_members where unit_id=s.unit_id and person_id=e.source_id and status='active') or not exists(select 1 from public.community_members where unit_id=s.unit_id and person_id=case when decision='accept' then actor else e.target_id end and status='active') then raise exception 'active_membership_required'; end if;
    if exists(select 1 from public.service_assignments where shift_id=s.id and person_id=case when decision='accept' then actor else e.target_id end and status<>'declined') then raise exception 'already_assigned'; end if;
    if decision='accept' then
      update public.service_exchanges set status='accepted',target_id=actor where id=exchange;
    else
      -- Replace exactly one occupied place. The source record remains as history.
      update public.service_assignments set status='declined',attended=false where id=a.id;
      insert into public.service_assignments(shift_id,person_id,status) values(s.id,e.target_id,'confirmed')
        on conflict(shift_id,person_id) do update set status='confirmed',attended=false;
      update public.service_exchanges set status='approved' where id=exchange;
    end if;
  else raise exception 'unauthorized' using errcode='42501';
  end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.exchange_'||decision,exchange);
end $$;

create function public.service_exchange_page(page integer)
returns table(id uuid,title text,unit_title text,starts_at timestamptz,ends_at timestamptz,status text,is_source boolean,is_target boolean,can_manage boolean,available boolean,source_name text,target_name text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.core_actor();
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
revoke all on function public.request_service_exchange(uuid),public.service_exchange_action(uuid,text),public.service_exchange_page(integer) from public,anon;
grant execute on function public.request_service_exchange(uuid),public.service_exchange_action(uuid,text),public.service_exchange_page(integer) to authenticated;
