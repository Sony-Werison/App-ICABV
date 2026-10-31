-- Additive Phase 2 content metadata and bounded pagination; homologation only.
alter table public.content_links
  add column preacher text not null default '' check(length(preacher)<=160),
  add column topic text not null default '' check(length(topic)<=160),
  add column preached_on date;

create function public.save_content_link(resource uuid,kind text,title text,url text,published boolean,preacher text,topic text,preached_on date) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  result:=public.save_content_link(resource,kind,title,url,published);
  update public.content_links set preacher=trim(save_content_link.preacher),topic=trim(save_content_link.topic),preached_on=save_content_link.preached_on where id=result;
  return result;
end $$;

create function public.prayer_feed_page(page integer) returns table(id uuid,body text,visibility text,moderation text,answered boolean,is_mine boolean,display_name text,anonymous boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select p.id,p.body,p.visibility,p.moderation,p.answered,p.person_id=private.person_id(),
    case when p.anonymous and p.person_id<>private.person_id() then 'Anônimo' else n.full_name end,p.anonymous
    from public.prayer_requests p join public.persons n on n.id=p.person_id
    where public.prayer_visible(p.id) order by p.created_at desc,p.id limit 21 offset page*20;
end $$;

create function public.event_roster_page(event uuid,page integer) returns table(person_id uuid,full_name text,status text,attended boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.manage_people() then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select r.person_id,p.full_name,r.status,r.attended from public.event_registrations r join public.persons p on p.id=r.person_id
    where r.event_id=event order by p.full_name,p.id limit 21 offset page*20;
end $$;
revoke all on function public.save_content_link(uuid,text,text,text,boolean,text,text,date),public.prayer_feed_page(integer),public.event_roster_page(uuid,integer) from public,anon;
grant execute on function public.save_content_link(uuid,text,text,text,boolean,text,text,date),public.prayer_feed_page(integer),public.event_roster_page(uuid,integer) to authenticated;

create function public.browse_links(page integer,search text) returns setof public.content_links
language plpgsql stable security definer set search_path='' as $$
begin
  if page is null or page<0 or page>100000 or search is null or length(search)>160 then raise exception 'invalid_query'; end if;
  return query select l.* from public.content_links l where public.content_visible(l.published,'public')
    and position(lower(trim(search)) in lower(l.title||' '||l.preacher||' '||l.topic))>0
    order by l.created_at desc,l.id limit 21 offset page*20;
end $$;
create function public.browse_events(page integer,search text,category text,include_past boolean) returns setof public.events
language plpgsql stable security definer set search_path='' as $$
begin
  if page is null or page<0 or page>100000 or search is null or length(search)>160 or category is null or length(category)>80 or include_past is null then raise exception 'invalid_query'; end if;
  return query select e.* from public.events e where public.event_visible(e.id)
    and (include_past or e.ends_at>now())
    and (browse_events.category='' or lower(e.category)=lower(trim(browse_events.category)))
    and position(lower(trim(search)) in lower(e.title||' '||e.location))>0
    order by e.starts_at,e.id limit 21 offset page*20;
end $$;
revoke all on function public.browse_links(integer,text),public.browse_events(integer,text,text,boolean) from public;
grant execute on function public.browse_links(integer,text),public.browse_events(integer,text,text,boolean) to anon,authenticated;

create function public.event_availability_for(events uuid[]) returns table(event_id uuid,registered_count bigint)
language sql stable security definer set search_path='' as $$
  select e.id,count(r.person_id) from public.events e left join public.event_registrations r on r.event_id=e.id and r.status='registered'
  where e.id=any(events) and cardinality(events)<=20 and public.event_visible(e.id) group by e.id
$$;
revoke all on function public.event_availability_for(uuid[]) from public;
grant execute on function public.event_availability_for(uuid[]) to anon,authenticated;
create index content_links_paging on public.content_links(created_at desc,id);
create index announcements_paging on public.announcements(created_at desc,id);
create index prayers_paging on public.prayer_requests(created_at desc,id);
