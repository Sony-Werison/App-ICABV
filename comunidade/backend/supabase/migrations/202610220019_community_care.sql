-- Birthday sharing is optional. Never expose birth years or contact details.
alter table public.person_contacts add column share_birthday boolean not null default false;
create function public.birthday_calendar(month_number integer, page_number integer default 0)
returns table(person_id uuid, full_name text, birth_day integer, birth_month integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'forbidden' using errcode='42501'; end if;
 if month_number not between 1 and 12 or month_number is null or page_number is null or page_number < 0 or page_number > 100000 then raise exception 'invalid_data'; end if;
 return query select p.id,p.full_name,extract(day from c.birth_date)::integer,extract(month from c.birth_date)::integer
 from public.person_contacts c join public.persons p on p.id=c.person_id
 where c.share_birthday and extract(month from c.birth_date)=month_number
 order by (to_char(c.birth_date,'MM-DD')=to_char(now() at time zone 'America/Sao_Paulo','MM-DD')) desc,extract(day from c.birth_date),p.full_name,p.id limit 100 offset page_number*100;
end $$;

create table public.food_campaigns (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 2 and 160),
 description text not null default '' check(length(description)<=3000),
 collection_point text not null check(length(trim(collection_point)) between 2 and 300),
 deadline date not null,
 status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now()
);
create table public.food_items (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.food_campaigns(id),
 name text not null check(length(trim(name)) between 2 and 120),
 unit text not null check(length(trim(unit)) between 1 and 60),
 target_quantity integer not null check(target_quantity between 1 and 100000)
);
create index food_items_campaign on public.food_items(campaign_id);
create table public.food_commitments (
 item_id uuid not null references public.food_items(id),
 person_id uuid not null references public.persons(id),
 quantity integer not null check(quantity between 0 and 100000),
 received_quantity integer not null default 0 check(received_quantity between 0 and quantity),
 updated_at timestamptz not null default now(),
 primary key(item_id,person_id)
);
alter table public.food_campaigns enable row level security;
alter table public.food_items enable row level security;
alter table public.food_commitments enable row level security;
create policy food_campaigns_read on public.food_campaigns for select to authenticated using(private.person_id() is not null);
create policy food_items_read on public.food_items for select to authenticated using(private.person_id() is not null);
create policy food_commitments_read on public.food_commitments for select to authenticated using(person_id=private.person_id() or private.manage_people());
revoke all on public.food_campaigns,public.food_items,public.food_commitments from public,anon,authenticated;
grant select on public.food_campaigns,public.food_items,public.food_commitments to authenticated;

create function public.save_food_campaign(resource uuid, campaign_title text, details text, collection text, due_date date, campaign_status text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; actor uuid:=private.core_actor();
begin
 if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
 if resource is null then
  insert into public.food_campaigns(title,description,collection_point,deadline,status)
  values(trim(campaign_title),coalesce(details,''),trim(collection),due_date,campaign_status) returning id into result;
 else
  update public.food_campaigns set title=trim(campaign_title),description=coalesce(details,''),collection_point=trim(collection),deadline=due_date,status=campaign_status where id=resource returning id into result;
  if result is null then raise exception 'campaign_unavailable'; end if;
 end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'food.campaign_saved',result);
 return result;
end $$;
create function public.save_food_item(resource uuid, campaign uuid, item_name text, item_unit text, target integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; used bigint; actor uuid:=private.core_actor();
begin
 if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.food_campaigns where id=campaign for update;
 if not found then raise exception 'campaign_unavailable'; end if;
 if resource is null then
  if (select count(*) from public.food_items where campaign_id=campaign)>=200 then raise exception 'item_limit'; end if;
  insert into public.food_items(campaign_id,name,unit,target_quantity) values(campaign,trim(item_name),trim(item_unit),target) returning id into result;
 else
  select coalesce(sum(quantity),0) into used from public.food_commitments where item_id=resource;
  if target<used then raise exception 'target_below_committed'; end if;
  -- Unit/name cannot change once someone has committed to this item.
  if used>0 and exists(select 1 from public.food_items where id=resource and (name<>trim(item_name) or unit<>trim(item_unit))) then raise exception 'item_in_use'; end if;
  update public.food_items set name=trim(item_name),unit=trim(item_unit),target_quantity=target where id=resource and campaign_id=campaign returning id into result;
  if result is null then raise exception 'item_unavailable'; end if;
 end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'food.item_saved',result);
 return result;
end $$;
create function public.food_item_summary(campaign uuid)
returns table(id uuid,name text,unit text,target_quantity integer,committed_quantity bigint,received_quantity bigint,my_quantity integer,my_received integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'forbidden' using errcode='42501'; end if;
 return query select i.id,i.name,i.unit,i.target_quantity,coalesce(sum(c.quantity),0),coalesce(sum(c.received_quantity),0),
 coalesce(max(c.quantity) filter(where c.person_id=private.person_id()),0),coalesce(max(c.received_quantity) filter(where c.person_id=private.person_id()),0)
 from public.food_items i left join public.food_commitments c on c.item_id=i.id where i.campaign_id=campaign
 group by i.id order by i.name,i.id;
end $$;
create function public.commit_food_item(item uuid, amount integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); c public.food_campaigns; i public.food_items; used bigint; received integer;
begin
 if amount is null or amount<0 or amount>100000 then raise exception 'invalid_quantity'; end if;
 select fc.* into c from public.food_campaigns fc join public.food_items fi on fi.campaign_id=fc.id where fi.id=item for update of fc;
 if not found then raise exception 'item_unavailable'; end if;
 if c.status<>'open' or c.deadline<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'campaign_closed'; end if;
 select * into i from public.food_items where id=item;
 select coalesce(sum(quantity),0) into used from public.food_commitments where item_id=item and person_id<>actor;
 select received_quantity into received from public.food_commitments where item_id=item and person_id=actor;
 if amount<coalesce(received,0) then raise exception 'below_received'; end if;
 if amount>i.target_quantity-used then raise exception 'item_full'; end if;
 insert into public.food_commitments(item_id,person_id,quantity) values(item,actor,amount)
 on conflict(item_id,person_id) do update set quantity=excluded.quantity,updated_at=now();
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'food.committed',item);
end $$;
create function public.receive_food_item(item uuid, contributor uuid, amount integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();
begin
 if not private.manage_people() then raise exception 'forbidden' using errcode='42501'; end if;
 if amount is null or amount<0 then raise exception 'invalid_quantity'; end if;
 perform 1 from public.food_campaigns fc join public.food_items fi on fi.campaign_id=fc.id where fi.id=item for update of fc;
 if not found then raise exception 'item_unavailable'; end if;
 update public.food_commitments set received_quantity=amount,updated_at=now() where item_id=item and person_id=contributor and amount<=quantity;
 if not found then raise exception 'invalid_quantity'; end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'food.received',item);
end $$;
revoke all on function public.birthday_calendar(integer,integer),public.save_food_campaign(uuid,text,text,text,date,text),public.save_food_item(uuid,uuid,text,text,integer),public.food_item_summary(uuid),public.commit_food_item(uuid,integer),public.receive_food_item(uuid,uuid,integer) from public,anon;
grant execute on function public.birthday_calendar(integer,integer),public.save_food_campaign(uuid,text,text,text,date,text),public.save_food_item(uuid,uuid,text,text,integer),public.food_item_summary(uuid),public.commit_food_item(uuid,integer),public.receive_food_item(uuid,uuid,integer) to authenticated;
