-- Additive foundation in a NEW Supabase project. Never run on a legacy database.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null default '' check (length(full_name) <= 120),
  membership_status text not null default 'visitor' check (membership_status in ('visitor','member','leader')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.role_assignments (
  person_id uuid not null references public.persons(id),
  role text not null check (role in ('visitor','member','volunteer','leader','secretary','treasurer','elder','admin')),
  granted_by uuid references public.persons(id),
  created_at timestamptz not null default now(),
  primary key(person_id,role)
);
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_by uuid references public.persons(id),
  created_at timestamptz not null default now()
);
create table public.family_members (
  family_id uuid not null references public.families(id),
  person_id uuid not null references public.persons(id),
  verified boolean not null default false,
  primary key(family_id,person_id)
);
create index family_members_person on public.family_members(person_id);
create table public.legal_documents (
  version text primary key,
  privacy_url text not null,
  terms_url text not null,
  published boolean not null default false
);
create table public.consent_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id),
  purpose text not null check(purpose in ('terms','religious_data','adult_declaration','analytics')),
  version text not null references public.legal_documents(version),
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consent_events_person on public.consent_events(person_id,created_at);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.persons(id),
  action text not null,
  resource_id uuid,
  created_at timestamptz not null default now()
);
create table public.legacy_mapping (
  source_system text not null check(source_system in ('ebd','louvor')),
  entity_type text not null,
  legacy_id text not null,
  canonical_id uuid not null,
  primary key(source_system,entity_type,legacy_id)
);

create function private.person_id() returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.persons where auth_user_id = (select auth.uid())
$$;
create function private.has_role(allowed text[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.role_assignments where person_id = private.person_id() and role = any(allowed))
$$;
create function private.manage_people() returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role(array['admin','secretary'])
$$;
create function private.own_family(family uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_members where family_id = family and person_id = private.person_id())
$$;
create function private.bootstrap_person() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Never accept role, status, person id or name from untrusted signup metadata.
  insert into public.persons(auth_user_id) values(new.id);
  return new;
end $$;
create trigger auth_user_created after insert on auth.users for each row execute function private.bootstrap_person();

alter table public.persons enable row level security;
alter table public.role_assignments enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.legal_documents enable row level security;
alter table public.consent_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.legacy_mapping enable row level security;

create policy persons_select on public.persons for select to authenticated using(id = private.person_id() or private.manage_people());
create policy persons_update_name on public.persons for update to authenticated using(id = private.person_id()) with check(id = private.person_id());
create policy roles_select on public.role_assignments for select to authenticated using(person_id = private.person_id() or private.has_role(array['admin']));
create policy families_select on public.families for select to authenticated using(private.own_family(id) or private.manage_people());
create policy family_members_select on public.family_members for select to authenticated using(person_id = private.person_id() or private.manage_people());
create policy legal_select on public.legal_documents for select to anon,authenticated using(published);
create policy consent_select on public.consent_events for select to authenticated using(person_id = private.person_id());
create policy audit_select on public.audit_log for select to authenticated using(private.has_role(array['admin']));

revoke all on public.persons, public.role_assignments, public.families, public.family_members, public.legal_documents, public.consent_events, public.audit_log, public.legacy_mapping from anon,authenticated;
grant select on public.legal_documents to anon,authenticated;
grant select on public.persons, public.role_assignments, public.families, public.family_members, public.consent_events, public.audit_log to authenticated;
grant update(full_name) on public.persons to authenticated;

create function public.my_roles() returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(role),array['visitor']::text[]) from public.role_assignments where person_id = private.person_id()
$$;
create function public.complete_onboarding(display_name text, document_version text, accept_terms boolean, accept_sensitive boolean, adult boolean, allow_analytics boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.person_id();
begin
  if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if accept_terms is distinct from true or accept_sensitive is distinct from true or adult is distinct from true or allow_analytics is null then raise exception 'consent_required' using errcode='22023'; end if;
  if length(trim(display_name)) not between 2 and 120 then raise exception 'invalid_name' using errcode='22023'; end if;
  if not exists(select 1 from public.legal_documents where version = document_version and published) then raise exception 'legal_not_published' using errcode='22023'; end if;
  update public.persons set full_name=trim(display_name), onboarded_at=now() where id=actor and onboarded_at is null;
  if not found then raise exception 'already_completed' using errcode='22023'; end if;
  insert into public.consent_events(person_id,purpose,version,granted) values
    (actor,'terms',document_version,true),(actor,'religious_data',document_version,true),
    (actor,'adult_declaration',document_version,true),(actor,'analytics',document_version,allow_analytics);
end $$;
create function public.withdraw_analytics() returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.person_id(); v text;
begin
  if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select version into v from public.consent_events where person_id=actor and purpose='analytics' order by created_at desc,id desc limit 1;
  if v is not null then insert into public.consent_events(person_id,purpose,version,granted) values(actor,'analytics',v,false); end if;
end $$;
create function public.create_family(family_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.person_id(); family uuid;
begin
  if not exists(select 1 from public.persons where id=actor and onboarded_at is not null) then raise exception 'onboarding_required' using errcode='42501'; end if;
  insert into public.families(name,created_by) values(trim(family_name),actor) returning id into family;
  insert into public.family_members(family_id,person_id,verified) values(family,actor,false);
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'family.created',family);
  return family;
end $$;
create function public.register_person(display_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
  if length(trim(display_name)) not between 2 and 120 then raise exception 'invalid_name' using errcode='22023'; end if;
  insert into public.persons(full_name) values(trim(display_name)) returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'person.created',result);
  return result;
end $$;
create function public.set_membership(person uuid, status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
  update public.persons set membership_status=status where id=person;
  if not found then raise exception 'not_found' using errcode='22023'; end if;
  -- Membership status is not an authorization role.
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'person.status_changed',person);
end $$;
create function public.link_family(family uuid, person uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.family_members(family_id,person_id,verified) values(family,person,true) on conflict(family_id,person_id) do update set verified=true;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'family.link_verified',family);
end $$;
create function public.grant_role(person uuid, assigned_role text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into public.role_assignments(person_id,role,granted_by) values(person,assigned_role,private.person_id()) on conflict do nothing;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'role.granted.' || assigned_role,person);
end $$;
create function public.revoke_role(person uuid, assigned_role text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501'; end if;
  lock table public.role_assignments in exclusive mode;
  if assigned_role='admin' and exists(select 1 from public.role_assignments where person_id=person and role='admin') and (select count(*) from public.role_assignments where role='admin') <= 1 then raise exception 'last_admin' using errcode='22023'; end if;
  delete from public.role_assignments where person_id=person and role=assigned_role;
  insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'role.revoked.' || assigned_role,person);
end $$;
-- Definer functions are not executable by PUBLIC/anon by default.
revoke all on all functions in schema private from public;
grant execute on function private.person_id(),private.has_role(text[]),private.manage_people(),private.own_family(uuid) to authenticated;
revoke all on function public.my_roles(),public.complete_onboarding(text,text,boolean,boolean,boolean,boolean),public.withdraw_analytics(),public.create_family(text),public.register_person(text),public.set_membership(uuid,text),public.link_family(uuid,uuid),public.grant_role(uuid,text),public.revoke_role(uuid,text) from public,anon;
grant execute on function public.my_roles(),public.complete_onboarding(text,text,boolean,boolean,boolean,boolean),public.withdraw_analytics(),public.create_family(text),public.register_person(text),public.set_membership(uuid,text),public.link_family(uuid,uuid),public.grant_role(uuid,text),public.revoke_role(uuid,text) to authenticated;

insert into public.legal_documents(version,privacy_url,terms_url,published) values('2026-10-20.v1','/privacidade','/termos',false);
