-- Participation requires an individual authenticated account, not legal/profile onboarding.
-- Historical consent records and onboarded_at remain untouched.
create or replace function private.core_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.person_id();
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501';end if;
 return actor;
end $$;
create or replace function private.management_actor() returns uuid language sql stable security definer set search_path='' as $$select private.core_actor()$$;
create or replace function public.create_family(family_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); family uuid;
begin
 if family_name is null or length(trim(family_name)) not between 2 and 120 then raise exception 'invalid_name';end if;
 insert into public.families(name,created_by) values(trim(family_name),actor) returning id into family;
 insert into public.family_members(family_id,person_id,verified) values(family,actor,false);
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'family.created',family);
 return family;
end $$;
create or replace function public.set_community_leader(unit uuid,person uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();
begin
 if not private.manage_people() or enabled is null then raise exception 'unauthorized' using errcode='42501';end if;
 if enabled then
  if not exists(select 1 from public.role_assignments r where r.person_id=person and r.role in ('leader','admin')) then raise exception 'leader_role_required';end if;
  insert into public.community_leaders(unit_id,person_id) values(unit,person) on conflict do nothing;
 else delete from public.community_leaders where unit_id=unit and person_id=person;end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'community.leader_changed',unit);
end $$;
create or replace function public.community_leader_options(unit uuid,search text,page integer) returns table(person_id uuid,full_name text,assigned boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.manage_people() or not exists(select 1 from public.community_units where id=unit) then raise exception 'unauthorized' using errcode='42501';end if;
 if page is null or page<0 or page>100000 or search is null or length(search)>120 then raise exception 'invalid_query';end if;
 return query select p.id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),exists(select 1 from public.community_leaders l where l.person_id=p.id and l.unit_id=unit) from public.persons p
 where position(lower(trim(search)) in lower(p.full_name))>0 and (exists(select 1 from public.role_assignments r where r.person_id=p.id and r.role in ('leader','admin')) or exists(select 1 from public.community_leaders l where l.person_id=p.id and l.unit_id=unit))
 order by p.full_name,p.id limit 21 offset page*20;
end $$;
revoke all on function private.core_actor(),private.management_actor() from public,anon,authenticated;
