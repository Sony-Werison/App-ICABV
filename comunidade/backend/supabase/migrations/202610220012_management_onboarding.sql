-- Management authorization is separate from personal/legal onboarding.
-- Personal participation continues to use private.core_actor(). No consent is invented.
create function private.management_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.person_id();
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501';end if;
 if not private.manage_people() and not exists(select 1 from public.persons where id=actor and onboarded_at is not null) then raise exception 'onboarding_required' using errcode='42501';end if;
 return actor;
end $$;
revoke all on function private.management_actor() from public,anon,authenticated;
create function public.create_managed_family(family_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.person_id(); result uuid;
begin
 if actor is null or not private.manage_people() then raise exception 'forbidden' using errcode='42501';end if;
 if family_name is null or length(trim(family_name)) not between 2 and 120 then raise exception 'invalid_name' using errcode='22023';end if;
 insert into public.families(name,created_by) values(trim(family_name),actor) returning id into result;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'family.managed_created',result);
 return result;
end $$;
revoke all on function public.create_managed_family(text) from public,anon;
grant execute on function public.create_managed_family(text) to authenticated;

create or replace function public.save_community_unit(resource uuid,kind text,title text,description text,schedule text,meeting_point text,published boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();result uuid;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  if resource is not null and exists(select 1 from public.community_units u where u.id=resource and u.kind<>save_community_unit.kind) then raise exception 'kind_mismatch'; end if;
  insert into public.community_units(id,kind,title,description,schedule,meeting_point,published) values(coalesce(resource,gen_random_uuid()),kind,trim(title),description,trim(schedule),trim(meeting_point),published)
    on conflict(id) do update set title=excluded.title,description=excluded.description,schedule=excluded.schedule,meeting_point=excluded.meeting_point,published=excluded.published returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.unit_saved',result);return result;
end $$;

create or replace function public.set_community_leader(unit uuid,person uuid,enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();
begin
  if not private.manage_people() or enabled is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if enabled then
    if not exists(select 1 from public.role_assignments r join public.persons p on p.id=r.person_id where r.person_id=person and r.role in ('leader','admin') and p.onboarded_at is not null) then raise exception 'leader_role_required'; end if;
    insert into public.community_leaders(unit_id,person_id) values(unit,person) on conflict do nothing;
  else delete from public.community_leaders where unit_id=unit and person_id=person; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.leader_changed',unit);
end $$;

create or replace function public.decide_community_membership(unit uuid,person uuid,approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();
begin
  if not private.unit_manager(unit) or approve is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform 1 from public.community_units where id=unit for update;
  update public.community_members set status=case when approve then 'active' else 'inactive' end where unit_id=unit and person_id=person and (not approve or status in ('requested','active'));
  if not found then raise exception 'membership_required'; end if;
  if not approve then perform private.deactivate_unit_member(unit,person); end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.membership_decided',unit);
end $$;

create or replace function public.save_service_shift(resource uuid,unit uuid,title text,starts_at timestamptz,ends_at timestamptz,capacity integer,canceled boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();result uuid;used integer;
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

create or replace function public.assign_service_shift(shift uuid,person uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();s public.service_shifts;existing public.service_assignments;used integer;result uuid;
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

create or replace function public.set_service_attendance(assignment uuid,present boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();s public.service_shifts;
begin
  select sh.* into s from public.service_shifts sh join public.service_assignments a on a.shift_id=sh.id where a.id=assignment for update of sh;
  if not found or not private.unit_manager(s.unit_id) or present is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if s.canceled then raise exception 'shift_closed'; end if;
  update public.service_assignments set attended=present where id=assignment and status='confirmed';
  if not found then raise exception 'confirmation_required'; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'service.attendance',assignment);
end $$;

create or replace function public.save_group_meeting(resource uuid,unit uuid,title text,topic text,location text,starts_at timestamptz,ends_at timestamptz,status text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();old public.group_meetings;result uuid;
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

create or replace function public.set_group_meeting_attendance(meeting uuid,person uuid,present boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();m public.group_meetings;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_meetings where id=meeting) for update;
 select * into m from public.group_meetings where id=meeting for update;
 if not found or not private.unit_manager(m.unit_id) then raise exception 'unauthorized' using errcode='42501'; end if;
 if present is null or m.status<>'published' or m.starts_at>now() then raise exception 'attendance_unavailable'; end if;
 update public.group_meeting_participants p set present=set_group_meeting_attendance.present where p.meeting_id=meeting and p.person_id=person and p.status='going';
 if not found then raise exception 'confirmation_required'; end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.meeting_attendance',meeting);
end $$;

create or replace function public.moderate_group_message(message uuid,publish boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.management_actor();m public.group_chat_messages;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_chat_messages where id=message) for update;
 select * into m from public.group_chat_messages where id=message for update;
 if not found or not private.unit_manager(m.unit_id) or publish is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if m.status='withdrawn' then raise exception 'message_withdrawn'; end if;
 update public.group_chat_messages set status=case when publish then 'published' else 'hidden' end,ever_published=ever_published or publish where id=message;
 delete from public.group_chat_reports where message_id=message;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,case when publish then 'group.message_published' else 'group.message_hidden' end,message);
end $$;

create or replace function public.service_exchange_action(exchange uuid,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=case when decision in ('approve','reject') and private.manage_people() then private.management_actor() else private.core_actor() end;e public.service_exchanges;s public.service_shifts;a public.service_assignments;
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
