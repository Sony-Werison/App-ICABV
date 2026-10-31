-- Only names of people already assigned to the church's published duty rosters.
create function public.duty_roster_people() returns table(person_id uuid,full_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'forbidden' using errcode='42501';end if;
 return query select p.id,p.full_name from public.persons p
 where p.merged_into is null and exists (
  select 1 from public.duty_rosters r,
  lateral jsonb_array_elements(r.groups) g,
  lateral jsonb_array_elements(g->'members') m
  where m->>'person_id'=p.id::text
 ) order by p.full_name,p.id;
end $$;
revoke all on function public.duty_roster_people() from public,anon;
grant execute on function public.duty_roster_people() to authenticated;
