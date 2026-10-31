-- Author identity stays out of the prayer mural API, including anonymous posts.
alter table public.prayer_requests add column anonymous boolean not null default false;
alter table public.prayer_requests add constraint prayer_anonymous_community check(not anonymous or visibility='community');
revoke select on public.prayer_requests from authenticated;
grant select(id,body,visibility,moderation,answered,created_at,anonymous) on public.prayer_requests to authenticated;
create function public.prayer_feed() returns table(id uuid,body text,visibility text,moderation text,answered boolean,is_mine boolean,display_name text,anonymous boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.body,p.visibility,p.moderation,p.answered,p.person_id=private.person_id(),
    case when p.anonymous and p.person_id<>private.person_id() then 'Anônimo' else n.full_name end,p.anonymous
  from public.prayer_requests p join public.persons n on n.id=p.person_id
  where public.prayer_visible(p.id) order by p.created_at desc,p.id limit 50
$$;
create function public.create_prayer(content text,visibility text,is_anonymous boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); result uuid;
begin
  insert into public.prayer_requests(person_id,body,visibility,anonymous) values(actor,trim(content),visibility,is_anonymous) returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'prayer.created',result);
  return result;
end $$;
create table public.core_notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  kind text not null check(kind in ('prayer_support')),
  resource_id uuid not null references public.prayer_requests(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.core_notifications enable row level security;
create policy notifications_read on public.core_notifications for select to authenticated using(person_id=private.person_id());
revoke all on public.core_notifications from anon,authenticated;
grant select on public.core_notifications to authenticated;
create or replace function public.support_prayer(prayer uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); target uuid; inserted integer;
begin
  if not public.prayer_visible(prayer) then raise exception 'unauthorized' using errcode='42501'; end if;
  select person_id into target from public.prayer_requests where id=prayer;
  insert into public.prayer_support(prayer_id,person_id) values(prayer,actor) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted=1 and actor<>target then
    insert into public.core_notifications(person_id,kind,resource_id) values(target,'prayer_support',prayer);
  end if;
end $$;
create function public.read_core_notification(notification uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.core_notifications set read_at=now() where id=notification and person_id=private.core_actor();
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
end $$;
alter table public.events add column category text not null default 'Outros' check(length(trim(category)) between 2 and 80);
alter table public.event_registrations add column attended boolean not null default false;
create function public.save_event(resource uuid,title text,description text,location text,starts_at timestamptz,ends_at timestamptz,capacity integer,audience text,status text,category text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  result:=public.save_event(resource,title,description,location,starts_at,ends_at,capacity,audience,status);
  update public.events set category=trim(save_event.category) where id=result;
  return result;
end $$;
create function public.event_roster(event uuid) returns table(person_id uuid,full_name text,status text,attended boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  return query select r.person_id,p.full_name,r.status,r.attended from public.event_registrations r join public.persons p on p.id=r.person_id where r.event_id=event order by p.full_name,p.id limit 200;
end $$;
create function public.set_event_attendance(event uuid,person uuid,present boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.manage_people() or present is null then raise exception 'unauthorized' using errcode='42501'; end if;
  perform 1 from public.events where id=event for update;
  update public.event_registrations set attended=present where event_id=event and person_id=person and status='registered';
  if not found then raise exception 'registration_required'; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'event.attendance_updated',event);
end $$;
revoke all on function public.prayer_feed(),public.create_prayer(text,text,boolean),public.read_core_notification(uuid),public.save_event(uuid,text,text,text,timestamptz,timestamptz,integer,text,text,text),public.event_roster(uuid),public.set_event_attendance(uuid,uuid,boolean) from public,anon;
grant execute on function public.prayer_feed(),public.create_prayer(text,text,boolean),public.read_core_notification(uuid),public.save_event(uuid,text,text,text,timestamptz,timestamptz,integer,text,text,text),public.event_roster(uuid),public.set_event_attendance(uuid,uuid,boolean) to authenticated;
