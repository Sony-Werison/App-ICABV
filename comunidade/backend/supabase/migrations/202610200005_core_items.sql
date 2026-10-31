-- Bounded event item pages expose aggregates, never contributors' identities.
create function public.item_availability_page(event uuid,page integer) returns table(id uuid,name text,quantity integer,remaining bigint,my_quantity integer)
language plpgsql stable security definer set search_path='' as $$
begin
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select i.* from public.item_availability(event) i order by i.name,i.id limit 21 offset page*20;
end $$;
revoke all on function public.item_availability_page(uuid,integer) from public;
grant execute on function public.item_availability_page(uuid,integer) to anon,authenticated;
