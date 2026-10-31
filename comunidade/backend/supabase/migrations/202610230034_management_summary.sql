-- One summary over the official domain tables. Counts never use a page of results.
create function public.management_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object(
  'persons',case when private.manage_people() then (select count(*) from public.persons where merged_into is null) else null end,
  'event_count',(select count(*) from public.events e where e.status='published' and e.starts_at>now() and public.event_visible(e.id)),
  'group_count',(select count(*) from public.community_units u where u.kind='group' and u.published),
  'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at,x.id) from (
   select e.id,e.title,e.starts_at,e.location from public.events e where e.status='published' and e.starts_at>now() and public.event_visible(e.id) order by e.starts_at,e.id limit 4
  ) x),'[]'::jsonb)
 );
end $$;
revoke all on function public.management_summary() from public,anon;
grant execute on function public.management_summary() to authenticated;
