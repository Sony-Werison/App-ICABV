-- Phase 4 foundation; no imports or modifications to EBD/Louvor.
create table public.community_units(
  id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('group','department')),
  title text not null check(length(trim(title)) between 2 and 160),description text not null default '' check(length(description)<=2000),
  schedule text not null default '' check(length(schedule)<=240),meeting_point text not null default '' check(length(meeting_point)<=240),
  published boolean not null default false,created_at timestamptz not null default now()
);
create table public.community_leaders(
  unit_id uuid not null references public.community_units(id),person_id uuid not null references public.persons(id),primary key(unit_id,person_id)
);
create table public.community_members(
  unit_id uuid not null references public.community_units(id),person_id uuid not null references public.persons(id),
  status text not null check(status in ('requested','active','inactive')),created_at timestamptz not null default now(),primary key(unit_id,person_id)
);
create table public.service_shifts(
  id uuid primary key default gen_random_uuid(),unit_id uuid not null references public.community_units(id),
  title text not null check(length(trim(title)) between 2 and 160),starts_at timestamptz not null,ends_at timestamptz not null,
  capacity integer not null check(capacity between 1 and 1000),canceled boolean not null default false,check(ends_at>starts_at)
);
create table public.service_assignments(
  id uuid primary key default gen_random_uuid(),shift_id uuid not null references public.service_shifts(id),person_id uuid not null references public.persons(id),
  status text not null default 'pending' check(status in ('pending','confirmed','declined')),attended boolean not null default false,
  created_at timestamptz not null default now(),unique(shift_id,person_id)
);
create index community_member_person on public.community_members(person_id,unit_id);
create index service_shifts_unit on public.service_shifts(unit_id,starts_at,id);
create index service_assignment_person on public.service_assignments(person_id,shift_id);

create function private.unit_manager(unit uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.manage_people() or (private.has_role(array['leader','admin']) and exists(select 1 from public.community_leaders l where l.unit_id=unit and l.person_id=private.person_id()))
$$;
create function private.unit_active(unit uuid,person uuid) returns boolean language sql stable security definer set search_path='' as $$
  select (person=private.person_id() or private.unit_manager(unit)) and exists(select 1 from public.community_members m where m.unit_id=unit and m.person_id=person and m.status='active')
$$;
alter table public.community_units enable row level security;
alter table public.community_leaders enable row level security;
alter table public.community_members enable row level security;
alter table public.service_shifts enable row level security;
alter table public.service_assignments enable row level security;
revoke all on public.community_units,public.community_leaders,public.community_members,public.service_shifts,public.service_assignments from anon,authenticated;
grant select on public.community_units,public.community_leaders,public.community_members,public.service_shifts,public.service_assignments to authenticated;
create policy units_read on public.community_units for select to authenticated using(published or private.unit_manager(id) or exists(select 1 from public.community_members m where m.unit_id=id and m.person_id=private.person_id() and m.status in ('requested','active')));
create policy unit_leaders_read on public.community_leaders for select to authenticated using(person_id=private.person_id() or private.unit_manager(unit_id));
create policy unit_members_read on public.community_members for select to authenticated using(person_id=private.person_id() or private.unit_manager(unit_id));
create policy shifts_read on public.service_shifts for select to authenticated using(private.unit_manager(unit_id) or private.unit_active(unit_id,private.person_id()));
create policy assignments_read on public.service_assignments for select to authenticated using(person_id=private.person_id() or exists(select 1 from public.service_shifts s where s.id=shift_id and private.unit_manager(s.unit_id)));

create function public.community_page(kind text,search text,page integer) returns table(id uuid,title text,description text,schedule text,meeting_point text,published boolean,my_status text,is_manager boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if kind is null or kind not in ('group','department') or search is null or length(search)>160 or page is null or page<0 or page>100000 then raise exception 'invalid_query'; end if;
  return query select u.id,u.title,u.description,u.schedule,u.meeting_point,u.published,m.status,private.unit_manager(u.id) from public.community_units u
    left join public.community_members m on m.unit_id=u.id and m.person_id=private.person_id()
    where u.kind=community_page.kind and (u.published or private.unit_manager(u.id) or m.status in ('requested','active')) and position(lower(trim(search)) in lower(u.title||' '||u.description))>0
    order by u.title,u.id limit 21 offset page*20;
end $$;
create function public.save_community_unit(resource uuid,kind text,title text,description text,schedule text,meeting_point text,published boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();result uuid;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  if resource is not null and exists(select 1 from public.community_units u where u.id=resource and u.kind<>save_community_unit.kind) then raise exception 'kind_mismatch'; end if;
  insert into public.community_units(id,kind,title,description,schedule,meeting_point,published) values(coalesce(resource,gen_random_uuid()),kind,trim(title),description,trim(schedule),trim(meeting_point),published)
    on conflict(id) do update set title=excluded.title,description=excluded.description,schedule=excluded.schedule,meeting_point=excluded.meeting_point,published=excluded.published returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.unit_saved',result);return result;
end $$;
create function public.set_community_leader(unit uuid,person uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();
begin
  if not private.manage_people() or enabled is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if enabled then
    if not exists(select 1 from public.role_assignments r join public.persons p on p.id=r.person_id where r.person_id=person and r.role in ('leader','admin') and p.onboarded_at is not null) then raise exception 'leader_role_required'; end if;
    insert into public.community_leaders(unit_id,person_id) values(unit,person) on conflict do nothing;
  else delete from public.community_leaders where unit_id=unit and person_id=person; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.leader_changed',unit);
end $$;
create function private.deactivate_unit_member(unit uuid,person uuid) returns void language plpgsql security definer set search_path='' as $$
declare shift record;
begin
  -- All assignment mutations lock shifts first, in deterministic order.
  for shift in select id from public.service_shifts where unit_id=unit and starts_at>now() order by id for update loop
    update public.service_assignments set status='declined',attended=false where shift_id=shift.id and person_id=person;
  end loop;
end $$;
create function public.request_community_membership(unit uuid,participate boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();
begin
  if participate is null then raise exception 'invalid_data'; end if;
  perform 1 from public.community_units u where u.id=unit and ((participate and u.published) or (not participate and exists(select 1 from public.community_members m where m.unit_id=unit and m.person_id=actor))) for update;
  if not found then raise exception 'unit_unavailable'; end if;
  insert into public.community_members(unit_id,person_id,status) values(unit,actor,case when participate then 'requested' else 'inactive' end)
    on conflict(unit_id,person_id) do update set status=case when participate and community_members.status='active' then 'active' when participate then 'requested' else 'inactive' end;
  if not participate then perform private.deactivate_unit_member(unit,actor); end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.membership_requested',unit);
end $$;
create function public.decide_community_membership(unit uuid,person uuid,approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();
begin
  if not private.unit_manager(unit) or approve is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform 1 from public.community_units where id=unit for update;
  update public.community_members set status=case when approve then 'active' else 'inactive' end where unit_id=unit and person_id=person and (not approve or status in ('requested','active'));
  if not found then raise exception 'membership_required'; end if;
  if not approve then perform private.deactivate_unit_member(unit,person); end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.membership_decided',unit);
end $$;
create function public.community_roster(unit uuid,page integer) returns table(person_id uuid,full_name text,status text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.unit_manager(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select m.person_id,p.full_name,m.status from public.community_members m join public.persons p on p.id=m.person_id where m.unit_id=unit order by p.full_name,p.id limit 21 offset page*20;
end $$;
create function public.save_service_shift(resource uuid,unit uuid,title text,starts_at timestamptz,ends_at timestamptz,capacity integer,canceled boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();result uuid;used integer;
begin
  if not private.unit_manager(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
  perform 1 from public.community_units where id=unit for update;
  if resource is not null then
    perform 1 from public.service_shifts s where s.id=resource and s.unit_id=unit for update;
    if not found then raise exception 'shift_unavailable'; end if;
    if canceled and exists(select 1 from public.service_shifts s where s.id=resource and s.starts_at<=now()) then raise exception 'shift_closed'; end if;
  end if;
  if canceled and starts_at<=now() then raise exception 'shift_closed'; end if;
  select count(*) into used from public.service_assignments a where a.shift_id=resource and a.status<>'declined';
  if capacity<used then raise exception 'capacity_below_assignments'; end if;
  insert into public.service_shifts(id,unit_id,title,starts_at,ends_at,capacity,canceled) values(coalesce(resource,gen_random_uuid()),unit,trim(title),starts_at,ends_at,capacity,canceled)
    on conflict(id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,canceled=excluded.canceled returning id into result;
  if canceled then update public.service_assignments set status='declined',attended=false where shift_id=result; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.shift_saved',result);return result;
end $$;
create function public.assign_service_shift(shift uuid,person uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();s public.service_shifts;existing public.service_assignments;used integer;result uuid;
begin
  -- Lock unit before shift, matching membership decisions/revocation.
  perform 1 from public.community_units u where u.id=(select unit_id from public.service_shifts where id=shift) for update;
  select * into s from public.service_shifts where id=shift for update;
  if not found or not private.unit_manager(s.unit_id) then raise exception 'unauthorized' using errcode='42501'; end if;
  if s.canceled or s.starts_at<=now() then raise exception 'shift_closed'; end if;
  if not private.unit_active(s.unit_id,person) then raise exception 'active_membership_required'; end if;
  select * into existing from public.service_assignments where shift_id=shift and person_id=person;
  if found and existing.status<>'declined' then return existing.id; end if;
  select count(*) into used from public.service_assignments where shift_id=shift and status<>'declined';
  if used>=s.capacity then raise exception 'shift_full'; end if;
  insert into public.service_assignments(shift_id,person_id) values(shift,person) on conflict(shift_id,person_id) do update set status='pending',attended=false returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.assigned',result);return result;
end $$;
create function public.respond_service_assignment(assignment uuid,accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();a public.service_assignments;s public.service_shifts;
begin
  select sh.* into s from public.service_shifts sh join public.service_assignments x on x.shift_id=sh.id where x.id=assignment for update of sh;
  select * into a from public.service_assignments where id=assignment and person_id=actor for update;
  if not found or accept is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if s.canceled or s.starts_at<=now() then raise exception 'shift_closed'; end if;
  if not private.unit_active(s.unit_id,actor) then raise exception 'active_membership_required'; end if;
  if accept and a.status='declined' then raise exception 'new_assignment_required'; end if;
  update public.service_assignments set status=case when accept then 'confirmed' else 'declined' end,attended=false where id=assignment;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.responded',assignment);
end $$;
create function public.my_service_assignments(page integer) returns table(id uuid,unit_title text,title text,starts_at timestamptz,ends_at timestamptz,status text,canceled boolean,attended boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select a.id,u.title,s.title,s.starts_at,s.ends_at,a.status,s.canceled,a.attended from public.service_assignments a join public.service_shifts s on s.id=a.shift_id join public.community_units u on u.id=s.unit_id where a.person_id=private.person_id() order by s.starts_at desc,a.id limit 21 offset page*20;
end $$;
create function public.unit_service_shifts(unit uuid,page integer) returns setof public.service_shifts
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.unit_manager(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select * from public.service_shifts where unit_id=unit order by starts_at desc,id limit 21 offset page*20;
end $$;
create function public.service_roster(shift uuid,page integer) returns table(id uuid,person_id uuid,full_name text,status text,attended boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.service_shifts s where s.id=shift and private.unit_manager(s.unit_id)) then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select a.id,a.person_id,p.full_name,a.status,a.attended from public.service_assignments a join public.persons p on p.id=a.person_id where a.shift_id=shift order by p.full_name,p.id limit 21 offset page*20;
end $$;
create function public.set_service_attendance(assignment uuid,present boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();s public.service_shifts;
begin
  select sh.* into s from public.service_shifts sh join public.service_assignments a on a.shift_id=sh.id where a.id=assignment for update of sh;
  if not found or not private.unit_manager(s.unit_id) or present is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if s.canceled then raise exception 'shift_closed'; end if;
  update public.service_assignments set attended=present where id=assignment and status='confirmed';
  if not found then raise exception 'confirmation_required'; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.attendance',assignment);
end $$;
revoke all on function private.deactivate_unit_member(uuid,uuid) from public,anon,authenticated;
revoke all on function private.unit_manager(uuid),private.unit_active(uuid,uuid) from public,anon;
grant execute on function private.unit_manager(uuid),private.unit_active(uuid,uuid) to authenticated;
revoke all on function public.community_page(text,text,integer),public.save_community_unit(uuid,text,text,text,text,text,boolean),public.set_community_leader(uuid,uuid,boolean),public.request_community_membership(uuid,boolean),public.decide_community_membership(uuid,uuid,boolean),public.community_roster(uuid,integer),public.save_service_shift(uuid,uuid,text,timestamptz,timestamptz,integer,boolean),public.assign_service_shift(uuid,uuid),public.respond_service_assignment(uuid,boolean),public.my_service_assignments(integer),public.unit_service_shifts(uuid,integer),public.service_roster(uuid,integer),public.set_service_attendance(uuid,boolean) from public,anon;
grant execute on function public.community_page(text,text,integer),public.save_community_unit(uuid,text,text,text,text,text,boolean),public.set_community_leader(uuid,uuid,boolean),public.request_community_membership(uuid,boolean),public.decide_community_membership(uuid,uuid,boolean),public.community_roster(uuid,integer),public.save_service_shift(uuid,uuid,text,timestamptz,timestamptz,integer,boolean),public.assign_service_shift(uuid,uuid),public.respond_service_assignment(uuid,boolean),public.my_service_assignments(integer),public.unit_service_shifts(uuid,integer),public.service_roster(uuid,integer),public.set_service_attendance(uuid,boolean) to authenticated;

create function public.community_leader_options(unit uuid,search text,page integer) returns table(person_id uuid,full_name text,assigned boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.manage_people() or not exists(select 1 from public.community_units where id=unit) then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 or search is null or length(search)>120 then raise exception 'invalid_query'; end if;
  return query select p.id,p.full_name,exists(select 1 from public.community_leaders l where l.person_id=p.id and l.unit_id=unit) from public.persons p
  where position(lower(trim(search)) in lower(p.full_name))>0 and ((p.onboarded_at is not null and length(trim(p.full_name))>0 and exists(select 1 from public.role_assignments r where r.person_id=p.id and r.role in ('leader','admin'))) or exists(select 1 from public.community_leaders l where l.person_id=p.id and l.unit_id=unit))
  order by p.full_name,p.id limit 21 offset page*20;
end $$;
revoke all on function public.community_leader_options(uuid,text,integer) from public,anon;
grant execute on function public.community_leader_options(uuid,text,integer) to authenticated;
