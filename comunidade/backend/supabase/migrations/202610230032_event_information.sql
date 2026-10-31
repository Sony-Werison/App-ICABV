alter table public.events add column payment_details text not null default '' check(length(payment_details)<=2000);
alter table public.events add column fundraising_details text not null default '' check(length(fundraising_details)<=2000);
create function public.save_event_information(resource uuid,title text,description text,location text,starts_at timestamptz,ends_at timestamptz,capacity integer,audience text,status text,category text,payment_details text,fundraising_details text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.manage_people() then raise exception 'unauthorized' using errcode='42501';end if;
 if length(coalesce(payment_details,''))>2000 or length(coalesce(fundraising_details,''))>2000 then raise exception 'invalid_data';end if;
 result:=public.save_event(resource,title,description,location,starts_at,ends_at,capacity,audience,status,category);
 update public.events e set payment_details=trim(coalesce(save_event_information.payment_details,'')),fundraising_details=trim(coalesce(save_event_information.fundraising_details,'')) where e.id=result;
 return result;
end $$;
revoke all on function public.save_event_information(uuid,text,text,text,timestamptz,timestamptz,integer,text,text,text,text,text) from public,anon;
grant execute on function public.save_event_information(uuid,text,text,text,timestamptz,timestamptz,integer,text,text,text,text,text) to authenticated;
