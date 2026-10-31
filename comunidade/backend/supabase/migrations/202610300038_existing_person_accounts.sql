-- Provision existing person rows into Auth while preserving their person IDs and roles.
create or replace function private.bootstrap_person() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if coalesce(new.raw_app_meta_data->>'provisioning_person_id','')<>'' then
    target:=(new.raw_app_meta_data->>'provisioning_person_id')::uuid;
    update public.persons set auth_user_id=new.id where id=target and auth_user_id is null;
    if not found then raise exception 'provisioning_person_unavailable' using errcode='23505'; end if;
  else
    insert into public.persons(auth_user_id) values(new.id);
  end if;
  return new;
end $$;

create or replace function private.person_id() returns uuid
language sql stable security definer set search_path='' as $$
  select p.id from public.persons p
  where p.auth_user_id=(select auth.uid())
    and coalesce((select u.raw_app_meta_data->>'must_change_password' from auth.users u where u.id=(select auth.uid())),'false')<>'true'
$$;

create or replace function private.finish_initial_password_change() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
    and coalesce(old.raw_app_meta_data->>'must_change_password','false')='true' then
    new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('must_change_password',false);
  end if;
  return new;
end $$;
create trigger auth_password_change_clears_first_login
before update of encrypted_password on auth.users
for each row execute function private.finish_initial_password_change();

-- The password-change flag is in app_metadata, which only the service role can alter.
create function public.identity_provisioning_ready() returns boolean
language sql stable security definer set search_path='' as $$
  select to_regprocedure('private.bootstrap_person()') is not null
$$;
revoke all on function public.identity_provisioning_ready() from public,anon;
grant execute on function public.identity_provisioning_ready() to service_role;
