-- Phase 2: additive, homologation only. No legacy imports or legal publication.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 2 and 160),
  body text not null check(length(trim(body)) between 2 and 6000),
  audience text not null default 'public' check(audience in ('public','authenticated')),
  published boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.content_links (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('devotional','youtube')),
  title text not null check(length(trim(title)) between 2 and 160),
  url text not null check(url ~ '^https://[^[:space:]]+$' and length(url)<=2000),
  check((kind='youtube' and url ~ '^https://(www[.])?(youtube[.]com|youtu[.]be)/') or (kind='devotional' and url ~ '^https://int[.]odbm[.]org/pt/')),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 2 and 160),
  description text not null default '' check(length(description)<=6000),
  location text not null default '' check(length(location)<=300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer check(capacity between 1 and 100000),
  audience text not null default 'public' check(audience in ('public','authenticated')),
  status text not null default 'draft' check(status in ('draft','published','canceled')),
  check(ends_at>starts_at)
);
create index events_starts on public.events(starts_at);
create table public.event_registrations (
  event_id uuid not null references public.events(id),
  person_id uuid not null references public.persons(id),
  status text not null check(status in ('registered','canceled')),
  created_at timestamptz not null default now(),
  primary key(event_id,person_id)
);
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null check(length(trim(name)) between 2 and 160),
  quantity integer not null check(quantity between 1 and 100000)
);
create index event_items_event on public.event_items(event_id);
create table public.item_reservations (
  item_id uuid not null references public.event_items(id),
  person_id uuid not null references public.persons(id),
  quantity integer not null check(quantity between 0 and 100000),
  primary key(item_id,person_id)
);
create table public.event_reminders (
  event_id uuid not null references public.events(id),
  person_id uuid not null references public.persons(id),
  due_at timestamptz not null,
  enabled boolean not null default true,
  primary key(event_id,person_id)
);
create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  body text not null check(length(trim(body)) between 2 and 2000),
  visibility text not null check(visibility in ('private','leadership','community')),
  moderation text not null default 'pending' check(moderation in ('pending','published','hidden')),
  answered boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.prayer_support (
  prayer_id uuid not null references public.prayer_requests(id),
  person_id uuid not null references public.persons(id),
  primary key(prayer_id,person_id)
);

create function public.content_visible(visible boolean, audience text) returns boolean
language sql stable security definer set search_path='' as $$
  select private.manage_people() or (visible and (audience='public' or (audience='authenticated' and auth.uid() is not null)))
$$;
create function public.event_visible(event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=event and public.content_visible(e.status='published',e.audience))
$$;
create function public.prayer_visible(prayer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.prayer_requests p where p.id=prayer and (
    p.person_id=private.person_id()
    or (p.visibility='leadership' and private.has_role(array['elder','admin']))
    or (p.visibility='community' and (private.has_role(array['elder','admin']) or (p.moderation='published' and private.has_role(array['member','volunteer','leader','secretary','treasurer']))))
  ))
$$;
create function private.core_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.person_id();
begin
  if not exists(select 1 from public.persons where id=actor and onboarded_at is not null) then raise exception 'onboarding_required' using errcode='42501'; end if;
  return actor;
end $$;

alter table public.announcements enable row level security;
alter table public.content_links enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_items enable row level security;
alter table public.item_reservations enable row level security;
alter table public.event_reminders enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.prayer_support enable row level security;
create policy announcements_read on public.announcements for select to anon,authenticated using(public.content_visible(published and (expires_at is null or expires_at>now()),audience));
create policy links_read on public.content_links for select to anon,authenticated using(public.content_visible(published,'public'));
create policy events_read on public.events for select to anon,authenticated using(public.content_visible(status='published',audience));
create policy items_read on public.event_items for select to anon,authenticated using(public.event_visible(event_id));
create policy registrations_read on public.event_registrations for select to authenticated using(person_id=private.person_id() or private.manage_people());
create policy reservations_read on public.item_reservations for select to authenticated using(person_id=private.person_id() or private.manage_people());
create policy reminders_read on public.event_reminders for select to authenticated using(person_id=private.person_id());
create policy prayers_read on public.prayer_requests for select to authenticated using(public.prayer_visible(id));
create policy support_read on public.prayer_support for select to authenticated using(person_id=private.person_id());
revoke all on public.announcements,public.content_links,public.events,public.event_items,public.event_registrations,public.item_reservations,public.event_reminders,public.prayer_requests,public.prayer_support from anon,authenticated;
grant select on public.announcements,public.content_links,public.events,public.event_items to anon,authenticated;
grant select on public.event_registrations,public.item_reservations,public.event_reminders,public.prayer_requests,public.prayer_support to authenticated;

create function public.register_event(event uuid, participate boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); e public.events; used integer;
begin
  if participate is null then raise exception 'invalid_data'; end if;
  select * into e from public.events where id=event for update;
  if not found or not public.event_visible(event) then raise exception 'event_unavailable' using errcode='42501'; end if;
  if participate then
    if e.status<>'published' or e.starts_at<=now() then raise exception 'event_closed'; end if;
    if exists(select 1 from public.event_registrations where event_id=event and person_id=actor and status='registered') then return; end if;
    select count(*) into used from public.event_registrations where event_id=event and status='registered';
    if e.capacity is not null and used>=e.capacity then raise exception 'event_full'; end if;
  end if;
  insert into public.event_registrations(event_id,person_id,status) values(event,actor,case when participate then 'registered' else 'canceled' end)
    on conflict(event_id,person_id) do update set status=excluded.status;
  if not participate then
    update public.item_reservations set quantity=0 where person_id=actor and item_id in(select id from public.event_items where event_id=event);
    update public.event_reminders set enabled=false where event_id=event and person_id=actor;
  end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,case when participate then 'event.registered' else 'event.registration_canceled' end,event);
end $$;
create function public.reserve_event_item(item uuid, amount integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); e public.events; target public.event_items; used integer; target_event uuid;
begin
  if amount is null or amount<0 then raise exception 'invalid_quantity'; end if;
  select event_id into target_event from public.event_items where id=item;
  select * into e from public.events where id=target_event for update;
  if not found or not public.event_visible(target_event) then raise exception 'event_unavailable' using errcode='42501'; end if;
  select * into target from public.event_items where id=item for update;
  if amount>0 and (e.status<>'published' or e.starts_at<=now()) then raise exception 'event_closed'; end if;
  if amount>0 and not exists(select 1 from public.event_registrations where event_id=target_event and person_id=actor and status='registered') then raise exception 'registration_required'; end if;
  select coalesce(sum(quantity),0) into used from public.item_reservations where item_id=item and person_id<>actor;
  if amount>target.quantity-used then raise exception 'item_full'; end if;
  insert into public.item_reservations(item_id,person_id,quantity) values(item,actor,amount)
    on conflict(item_id,person_id) do update set quantity=excluded.quantity;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'event.item_reserved',item);
end $$;
create function public.event_availability() returns table(event_id uuid,registered_count bigint)
language sql stable security definer set search_path='' as $$
  select e.id,(select count(*) from public.event_registrations r where r.event_id=e.id and r.status='registered')
  from public.events e where public.event_visible(e.id)
$$;
create function public.item_availability(event uuid) returns table(id uuid,name text,quantity integer,remaining bigint,my_quantity integer)
language sql stable security definer set search_path='' as $$
  select i.id,i.name,i.quantity,i.quantity-coalesce((select sum(r.quantity) from public.item_reservations r where r.item_id=i.id),0),
    coalesce((select r.quantity from public.item_reservations r where r.item_id=i.id and r.person_id=private.person_id()),0)
  from public.event_items i where i.event_id=event and public.event_visible(event)
$$;
create function public.set_event_reminder(event uuid, enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); e public.events;
begin
  select * into e from public.events where id=event for update;
  if not found or not public.event_visible(event) or e.status<>'published' or e.starts_at<=now() then raise exception 'event_closed'; end if;
  if enabled is null or not exists(select 1 from public.event_registrations where event_id=event and person_id=actor and status='registered') then raise exception 'registration_required'; end if;
  insert into public.event_reminders(event_id,person_id,due_at,enabled) values(event,actor,greatest(now(),e.starts_at-interval '1 hour'),enabled)
  on conflict(event_id,person_id) do update set due_at=excluded.due_at,enabled=excluded.enabled;
end $$;
create function public.create_prayer(content text, visibility text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); result uuid;
begin
  insert into public.prayer_requests(person_id,body,visibility) values(actor,trim(content),visibility) returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'prayer.created',result);
  return result;
end $$;
create function public.answer_prayer(prayer uuid, answered boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.prayer_requests p set answered=answer_prayer.answered where p.id=prayer and p.person_id=private.core_actor();
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
end $$;
create function public.support_prayer(prayer uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.prayer_visible(prayer) then raise exception 'unauthorized' using errcode='42501'; end if;
  insert into public.prayer_support(prayer_id,person_id) values(prayer,private.core_actor()) on conflict do nothing;
end $$;
create function public.moderate_prayer(prayer uuid, publish boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.has_role(array['elder','admin']) or publish is null then raise exception 'unauthorized' using errcode='42501'; end if;
  update public.prayer_requests set moderation=case when publish then 'published' else 'hidden' end where id=prayer and visibility='community';
  if not found then raise exception 'unavailable'; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'prayer.moderated',prayer);
end $$;

-- Management is restricted to Admin/Secretaria. No direct table writes from clients.
create function public.save_announcement(resource uuid, title text, body text, audience text, published boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  insert into public.announcements(id,title,body,audience,published) values(coalesce(resource,gen_random_uuid()),trim(title),trim(body),audience,published)
    on conflict(id) do update set title=excluded.title,body=excluded.body,audience=excluded.audience,published=excluded.published returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'announcement.saved',result);
  return result;
end $$;
create function public.save_content_link(resource uuid, kind text, title text, url text, published boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  insert into public.content_links(id,kind,title,url,published) values(coalesce(resource,gen_random_uuid()),kind,trim(title),trim(url),published)
    on conflict(id) do update set kind=excluded.kind,title=excluded.title,url=excluded.url,published=excluded.published returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'content_link.saved',result);
  return result;
end $$;
create function public.save_event(resource uuid,title text,description text,location text,starts_at timestamptz,ends_at timestamptz,capacity integer,audience text,status text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; used bigint;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  if resource is not null then perform 1 from public.events where id=resource for update; end if;
  select count(*) into used from public.event_registrations where event_id=resource and event_registrations.status='registered';
  if capacity is not null and capacity<used then raise exception 'capacity_below_registrations'; end if;
  insert into public.events(id,title,description,location,starts_at,ends_at,capacity,audience,status)
    values(coalesce(resource,gen_random_uuid()),trim(title),description,trim(location),starts_at,ends_at,capacity,audience,status)
    on conflict(id) do update set title=excluded.title,description=excluded.description,location=excluded.location,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,audience=excluded.audience,status=excluded.status returning id into result;
  if status='canceled' then
    update public.event_registrations set status='canceled' where event_id=result;
    update public.item_reservations set quantity=0 where item_id in(select id from public.event_items where event_id=result);
    update public.event_reminders set enabled=false where event_id=result;
  else
    update public.event_reminders set due_at=greatest(now(),save_event.starts_at-interval '1 hour') where event_id=result and enabled;
  end if;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'event.saved',result);
  return result;
end $$;
create function public.save_event_item(resource uuid,event uuid,name text,quantity integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; used bigint;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  perform 1 from public.events where id=event for update;
  if not found then raise exception 'event_unavailable'; end if;
  if resource is not null and exists(select 1 from public.event_items where id=resource and event_id<>event) then raise exception 'event_mismatch'; end if;
  select coalesce(sum(r.quantity),0) into used from public.item_reservations r where item_id=resource;
  if quantity<used then raise exception 'quantity_below_reservations'; end if;
  insert into public.event_items(id,event_id,name,quantity) values(coalesce(resource,gen_random_uuid()),event,trim(name),quantity)
    on conflict(id) do update set name=excluded.name,quantity=excluded.quantity returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'event.item_saved',result);
  return result;
end $$;

revoke all on function private.core_actor() from public,anon,authenticated;
revoke all on function public.content_visible(boolean,text),public.event_visible(uuid),public.prayer_visible(uuid),public.event_availability(),public.item_availability(uuid) from public;
grant execute on function public.content_visible(boolean,text),public.event_visible(uuid),public.event_availability(),public.item_availability(uuid) to anon,authenticated;
grant execute on function public.prayer_visible(uuid) to authenticated;
revoke all on function public.register_event(uuid,boolean),public.reserve_event_item(uuid,integer),public.set_event_reminder(uuid,boolean),public.create_prayer(text,text),public.answer_prayer(uuid,boolean),public.support_prayer(uuid),public.moderate_prayer(uuid,boolean),public.save_announcement(uuid,text,text,text,boolean),public.save_content_link(uuid,text,text,text,boolean),public.save_event(uuid,text,text,text,timestamptz,timestamptz,integer,text,text),public.save_event_item(uuid,uuid,text,integer) from public,anon;
grant execute on function public.register_event(uuid,boolean),public.reserve_event_item(uuid,integer),public.set_event_reminder(uuid,boolean),public.create_prayer(text,text),public.answer_prayer(uuid,boolean),public.support_prayer(uuid),public.moderate_prayer(uuid,boolean),public.save_announcement(uuid,text,text,text,boolean),public.save_content_link(uuid,text,text,text,boolean),public.save_event(uuid,text,text,text,timestamptz,timestamptz,integer,text,text),public.save_event_item(uuid,uuid,text,integer) to authenticated;
