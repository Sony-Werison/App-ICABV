-- Isolated simulator. These tables/functions must NEVER process real payments.
create table public.finance_demo_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into public.finance_demo_settings(enabled) values(false);
create function private.finance_demo_actor() returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not (select enabled from public.finance_demo_settings where singleton) then raise exception 'demo_disabled'; end if;
  return private.core_actor();
end $$;
create function private.finance_read() returns boolean language sql stable security definer set search_path='' as $$select private.has_role(array['treasurer','elder','admin'])$$;
create function private.finance_write() returns boolean language sql stable security definer set search_path='' as $$select private.has_role(array['treasurer','admin'])$$;
create table public.finance_demo_campaigns(
  id uuid primary key default gen_random_uuid(),title text not null check(length(trim(title)) between 2 and 160),
  description text not null default '' check(length(description)<=2000),goal_cents bigint not null check(goal_cents between 1 and 100000000),
  active boolean not null default false,is_test boolean not null default true check(is_test),created_at timestamptz not null default now()
);
create table public.finance_demo_contributions(
  id uuid primary key default gen_random_uuid(),person_id uuid not null references public.persons(id),campaign_id uuid not null references public.finance_demo_campaigns(id),
  amount_cents bigint not null check(amount_cents between 1 and 10000000),status text not null default 'pending' check(status in ('pending','settled','refunded')),
  request_key uuid not null,is_test boolean not null default true check(is_test),created_at timestamptz not null default now(),unique(person_id,request_key)
);
create table public.finance_demo_events(
  event_key uuid primary key,contribution_id uuid not null references public.finance_demo_contributions(id),
  status text not null check(status in ('settled','refunded')),created_at timestamptz not null default now()
);
create table public.finance_demo_ledger(
  id uuid primary key default gen_random_uuid(),contribution_id uuid references public.finance_demo_contributions(id),
  kind text not null check(kind in ('settlement','refund','income','expense','reversal')),
  amount_cents bigint not null check(amount_cents<>0 and abs(amount_cents)<=100000000),
  description text not null default '' check(length(description)<=240),category text not null default '' check(length(category)<=80),
  reverses_id uuid unique references public.finance_demo_ledger(id),recorded_by uuid not null references public.persons(id),request_key uuid,
  is_test boolean not null default true check(is_test),created_at timestamptz not null default now(),
  unique(contribution_id,kind),unique(recorded_by,request_key),
  check((kind in ('settlement','refund') and contribution_id is not null and request_key is null and reverses_id is null)
    or (kind in ('income','expense') and contribution_id is null and request_key is not null and reverses_id is null)
    or (kind='reversal' and contribution_id is null and request_key is null and reverses_id is not null)),
  check((kind in ('settlement','income') and amount_cents>0) or (kind in ('refund','expense') and amount_cents<0) or kind='reversal')
);
create index finance_demo_contribution_pages on public.finance_demo_contributions(person_id,created_at desc,id);
create index finance_demo_ledger_pages on public.finance_demo_ledger(created_at desc,id);
alter table public.finance_demo_settings enable row level security;
alter table public.finance_demo_events enable row level security;
revoke all on public.finance_demo_settings,public.finance_demo_events from anon,authenticated;
alter table public.finance_demo_campaigns enable row level security;
alter table public.finance_demo_contributions enable row level security;
alter table public.finance_demo_ledger enable row level security;
revoke all on public.finance_demo_campaigns,public.finance_demo_contributions,public.finance_demo_ledger from anon,authenticated;
grant select on public.finance_demo_campaigns,public.finance_demo_contributions,public.finance_demo_ledger to authenticated;
create policy demo_campaign_read on public.finance_demo_campaigns for select to authenticated using(active or private.finance_read());
create policy demo_contribution_read on public.finance_demo_contributions for select to authenticated using(person_id=private.person_id() or private.finance_read());
create policy demo_ledger_read on public.finance_demo_ledger for select to authenticated using(private.finance_read());

create function public.finance_demo_enabled() returns boolean language sql stable security definer set search_path='' as $$select enabled from public.finance_demo_settings where singleton$$;
create function public.create_demo_contribution(campaign uuid,amount bigint,request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.finance_demo_actor(); result public.finance_demo_contributions;
begin
  if campaign is null or amount is null or amount<1 or amount>10000000 or request is null then raise exception 'invalid_amount'; end if;
  select * into result from public.finance_demo_contributions where person_id=actor and request_key=request;
  if found then
    if result.campaign_id<>campaign or result.amount_cents<>amount then raise exception 'idempotency_conflict'; end if;
    return result.id;
  end if;
  perform 1 from public.finance_demo_campaigns where id=campaign and active for share;
  if not found then raise exception 'campaign_unavailable'; end if;
  insert into public.finance_demo_contributions(person_id,campaign_id,amount_cents,request_key) values(actor,campaign,amount,request)
    on conflict(person_id,request_key) do nothing;
  select * into result from public.finance_demo_contributions where person_id=actor and request_key=request;
  if result.campaign_id<>campaign or result.amount_cents<>amount then raise exception 'idempotency_conflict'; end if;
  return result.id;
end $$;

create function public.simulate_finance_event(contribution uuid,event uuid,new_status text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.finance_demo_actor(); payment public.finance_demo_contributions; seen public.finance_demo_events;
begin
  if event is null or new_status not in ('settled','refunded') or new_status is null then raise exception 'invalid_event'; end if;
  select * into payment from public.finance_demo_contributions where id=contribution and person_id=actor for update;
  if not found then raise exception 'unauthorized' using errcode='42501'; end if;
  insert into public.finance_demo_events(event_key,contribution_id,status) values(event,contribution,new_status) on conflict do nothing;
  select * into seen from public.finance_demo_events where event_key=event;
  if seen.contribution_id<>contribution or seen.status<>new_status then raise exception 'idempotency_conflict'; end if;
  if new_status='settled' then
    insert into public.finance_demo_ledger(contribution_id,kind,amount_cents,recorded_by) values(contribution,'settlement',payment.amount_cents,actor) on conflict(contribution_id,kind) do nothing;
    if payment.status<>'refunded' then update public.finance_demo_contributions set status='settled' where id=contribution; end if;
  else update public.finance_demo_contributions set status='refunded' where id=contribution; end if;
  if new_status='refunded' or payment.status='refunded' then
    if exists(select 1 from public.finance_demo_ledger where contribution_id=contribution and kind='settlement') then
      insert into public.finance_demo_ledger(contribution_id,kind,amount_cents,recorded_by) values(contribution,'refund',-payment.amount_cents,actor) on conflict(contribution_id,kind) do nothing;
    end if;
  end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'finance_demo.event',contribution);
end $$;

create function public.save_demo_campaign(resource uuid,title text,description text,goal bigint,active boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.finance_demo_actor(); result uuid;
begin
  if not private.finance_write() then raise exception 'unauthorized' using errcode='42501'; end if;
  insert into public.finance_demo_campaigns(id,title,description,goal_cents,active) values(coalesce(resource,gen_random_uuid()),trim(title),description,goal,active)
  on conflict(id) do update set title=excluded.title,description=excluded.description,goal_cents=excluded.goal_cents,active=excluded.active returning id into result;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'finance_demo.campaign_saved',result);
  return result;
end $$;
create function public.record_demo_cash(direction text,amount bigint,description text,category text,request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.finance_demo_actor(); result public.finance_demo_ledger; signed_amount bigint;
begin
  if not private.finance_write() then raise exception 'unauthorized' using errcode='42501'; end if;
  if direction is null or direction not in ('income','expense') or amount is null or amount<1 or amount>100000000 or request is null or length(trim(description))<2 or length(trim(category))<2 then raise exception 'invalid_entry'; end if;
  signed_amount:=case when direction='income' then amount else -amount end;
  insert into public.finance_demo_ledger(kind,amount_cents,description,category,recorded_by,request_key) values(direction,signed_amount,trim(description),trim(category),actor,request) on conflict(recorded_by,request_key) do nothing;
  select * into result from public.finance_demo_ledger where recorded_by=actor and request_key=request;
  if result.kind<>direction or result.amount_cents<>signed_amount or result.description<>trim(description) or result.category<>trim(category) then raise exception 'idempotency_conflict'; end if;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'finance_demo.cash_recorded',result.id);
  return result.id;
end $$;
create function public.reverse_demo_cash(entry uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.finance_demo_actor(); original public.finance_demo_ledger;
begin
  if not private.finance_write() then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into original from public.finance_demo_ledger where id=entry and kind in ('income','expense') for update;
  if not found then raise exception 'invalid_entry'; end if;
  insert into public.finance_demo_ledger(kind,amount_cents,description,category,reverses_id,recorded_by)
    values('reversal',-original.amount_cents,'Estorno de lançamento fictício',original.category,entry,actor) on conflict(reverses_id) do nothing;
  insert into public.audit_log(actor_id,action,resource_id) values(actor,'finance_demo.cash_reversed',entry);
end $$;
create function public.demo_campaign_progress(campaigns uuid[] default null) returns table(campaign_id uuid,total_cents bigint)
language sql stable security definer set search_path='' as $$
  select c.id,coalesce(sum(l.amount_cents),0)::bigint from public.finance_demo_campaigns c
  left join public.finance_demo_contributions p on p.campaign_id=c.id left join public.finance_demo_ledger l on l.contribution_id=p.id
  where (c.active or private.finance_read()) and (campaigns is null or (cardinality(campaigns)<=20 and c.id=any(campaigns))) group by c.id
$$;
create function public.demo_finance_report(page integer) returns setof public.finance_demo_ledger
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.finance_read() then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select * from public.finance_demo_ledger order by created_at desc,id limit 21 offset page*20;
end $$;
create function public.demo_finance_totals() returns table(income_cents bigint,expense_cents bigint,balance_cents bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.finance_read() then raise exception 'unauthorized' using errcode='42501'; end if;
  return query select coalesce(sum(amount_cents) filter(where amount_cents>0),0)::bigint,coalesce(-sum(amount_cents) filter(where amount_cents<0),0)::bigint,coalesce(sum(amount_cents),0)::bigint from public.finance_demo_ledger;
end $$;
revoke all on function private.finance_demo_actor() from public,anon,authenticated;
revoke all on function private.finance_read(),private.finance_write() from public,anon;
grant execute on function private.finance_read(),private.finance_write() to authenticated;
revoke all on function public.finance_demo_enabled(),public.create_demo_contribution(uuid,bigint,uuid),public.simulate_finance_event(uuid,uuid,text),public.save_demo_campaign(uuid,text,text,bigint,boolean),public.record_demo_cash(text,bigint,text,text,uuid),public.reverse_demo_cash(uuid),public.demo_campaign_progress(uuid[]),public.demo_finance_report(integer),public.demo_finance_totals() from public,anon;
grant execute on function public.finance_demo_enabled(),public.create_demo_contribution(uuid,bigint,uuid),public.simulate_finance_event(uuid,uuid,text),public.save_demo_campaign(uuid,text,text,bigint,boolean),public.record_demo_cash(text,bigint,text,text,uuid),public.reverse_demo_cash(uuid),public.demo_campaign_progress(uuid[]),public.demo_finance_report(integer),public.demo_finance_totals() to authenticated;

create function public.demo_campaign_page(page integer,include_inactive boolean) returns setof public.finance_demo_campaigns
language plpgsql stable security definer set search_path='' as $$
begin
  if include_inactive is null or (include_inactive and not private.finance_read()) then raise exception 'unauthorized' using errcode='42501'; end if;
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select * from public.finance_demo_campaigns where active or include_inactive order by created_at desc,id limit 21 offset page*20;
end $$;
create function public.my_demo_contributions(page integer) returns setof public.finance_demo_contributions
language plpgsql stable security definer set search_path='' as $$
begin
  if page is null or page<0 or page>100000 then raise exception 'invalid_page'; end if;
  return query select * from public.finance_demo_contributions where person_id=private.person_id() order by created_at desc,id limit 21 offset page*20;
end $$;
create function public.my_demo_year(year integer) returns table(received_cents bigint,refunded_cents bigint,net_cents bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if year is null or year<2000 or year>2100 then raise exception 'invalid_year'; end if;
  return query select coalesce(sum(l.amount_cents) filter(where l.amount_cents>0),0)::bigint,coalesce(-sum(l.amount_cents) filter(where l.amount_cents<0),0)::bigint,coalesce(sum(l.amount_cents),0)::bigint
    from public.finance_demo_ledger l join public.finance_demo_contributions p on p.id=l.contribution_id
    where p.person_id=private.person_id() and l.created_at>=make_timestamptz(year,1,1,0,0,0,'America/Sao_Paulo') and l.created_at<make_timestamptz(year+1,1,1,0,0,0,'America/Sao_Paulo');
end $$;
revoke all on function public.demo_campaign_page(integer,boolean),public.my_demo_contributions(integer),public.my_demo_year(integer) from public,anon;
grant execute on function public.demo_campaign_page(integer,boolean),public.my_demo_contributions(integer),public.my_demo_year(integer) to authenticated;
