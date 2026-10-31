-- Unified administrative people directory.
-- Existing module and membership data remains the source of truth.
create or replace function public.management_people(
  search_text text default '',
  status_filter text default 'all',
  page_number integer default 0,
  unit_filter uuid default null
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
  if search_text is null or length(search_text)>160
    or status_filter is null or status_filter not in('all','unreviewed','visitor','member','leader')
    or page_number is null or page_number<0 or page_number>100000 then
    raise exception 'invalid_query';
  end if;
  with matching as materialized (
    select
      p.id,
      regexp_replace(trim(coalesce(p.full_name,'')), '\s+', ' ', 'g') as full_name,
      p.membership_status,
      p.membership_reviewed_at,
      coalesce(nullif(lower(trim(pc.email)),''), nullif(lower(trim(au.email)),''), '') as email,
      coalesce(trim(pc.phone),'') as phone,
      coalesce((
        select array_agg(ra.role order by ra.role)
        from public.role_assignments ra
        where ra.person_id=p.id
      ), '{}'::text[]) as roles,
      coalesce((
        select jsonb_agg(jsonb_build_object('module',ma.module,'role',ma.role) order by ma.module)
        from public.module_access ma
        where ma.person_id=p.id
      ), '[]'::jsonb) as module_access,
      coalesce((
        select jsonb_agg(jsonb_build_object('id',cu.id,'title',cu.title,'kind',cu.kind) order by cu.title)
        from public.community_members cm
        join public.community_units cu on cu.id=cm.unit_id
        where cm.person_id=p.id and cm.status='active'
      ), '[]'::jsonb) as units,
      coalesce(wm.roles, '{}'::text[]) as worship_roles,
      coalesce(wm.active, false) as worship_active,
      coalesce((
        select array_agg(distinct ecm.role order by ecm.role)
        from public.ebd_class_members ecm
        where ecm.person_id=p.id
      ), '{}'::text[]) as ebd_roles
    from public.persons p
    left join public.person_contacts pc on pc.person_id=p.id
    left join public.worship_members wm on wm.person_id=p.id
    left join auth.users au on au.id=p.auth_user_id
    where p.merged_into is null
      and (trim(search_text)='' or position(private.identity_name(search_text) in private.identity_name(p.full_name))>0)
      and (status_filter='all'
        or (status_filter='unreviewed' and p.membership_reviewed_at is null)
        or (p.membership_status=status_filter and p.membership_reviewed_at is not null))
      and (unit_filter is null or exists(
        select 1 from public.community_members m
        where m.person_id=p.id and m.unit_id=unit_filter and m.status='active'
      ))
  ), page as (
    select * from matching order by full_name,id limit 25 offset page_number*25
  )
  select jsonb_build_object(
    'total',(select count(*) from matching),
    'items',coalesce((select jsonb_agg(to_jsonb(page) order by full_name,id) from page),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.normalize_person_records()
returns integer
language plpgsql security definer set search_path=''
as $$
declare changed integer;
begin
  if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501'; end if;
  update public.persons
     set full_name=regexp_replace(trim(coalesce(full_name,'')), '\s+', ' ', 'g')
   where full_name is distinct from regexp_replace(trim(coalesce(full_name,'')), '\s+', ' ', 'g');
  get diagnostics changed = row_count;
  update public.person_contacts
     set email=lower(trim(coalesce(email,''))), phone=trim(coalesce(phone,''))
   where email is distinct from lower(trim(coalesce(email,'')))
      or phone is distinct from trim(coalesce(phone,''));
  insert into public.audit_log(actor_id,action,resource_id)
  values(private.person_id(),'people.normalized',null);
  return changed;
end $$;

create or replace function public.set_person_unit_assignment(unit uuid, person uuid, enabled boolean)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not private.manage_people() or enabled is null then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.community_units where id=unit)
    or not exists(select 1 from public.persons where id=person and merged_into is null) then
    raise exception 'not_found';
  end if;
  insert into public.community_members(unit_id,person_id,status)
  values(unit,person,case when enabled then 'active' else 'inactive' end)
  on conflict(unit_id,person_id) do update set status=excluded.status;
  insert into public.audit_log(actor_id,action,resource_id)
  values(private.person_id(),'person.unit_assignment_changed',unit);
end $$;

revoke all on function public.management_people(text,text,integer,uuid),public.normalize_person_records() from public,anon;
revoke all on function public.set_person_unit_assignment(uuid,uuid,boolean) from public,anon;
grant execute on function public.management_people(text,text,integer,uuid),public.normalize_person_records(),public.set_person_unit_assignment(uuid,uuid,boolean) to authenticated;
