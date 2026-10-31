create table public.push_subscriptions (
  person_id uuid not null references public.persons(id) on delete cascade,
  endpoint text not null check (length(endpoint) between 1 and 2000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth_secret text not null check (length(auth_secret) between 1 and 100),
  user_agent text not null default '' check (length(user_agent)<=500),
  created_at timestamptz not null default now(),
  primary key(person_id,endpoint)
);
create index push_subscriptions_person on public.push_subscriptions(person_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_read_own on public.push_subscriptions for select to authenticated using(person_id=private.person_id());
revoke all on public.push_subscriptions from public,anon,authenticated;
grant select on public.push_subscriptions to authenticated;

create function public.save_my_push_subscription(subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.person_id(); endpoint_value text:=subscription->>'endpoint'; keys jsonb:=subscription->'keys';
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if endpoint_value is null or endpoint_value !~ '^https://' or length(endpoint_value)>2000 or coalesce(keys->>'p256dh','')='' or coalesce(keys->>'auth','')='' then raise exception 'invalid_subscription' using errcode='22023'; end if;
 insert into public.push_subscriptions(person_id,endpoint,p256dh,auth_secret,user_agent)
 values(actor,endpoint_value,keys->>'p256dh',keys->>'auth',left(coalesce(subscription->>'user_agent',''),500))
 on conflict(person_id,endpoint) do update set p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,user_agent=excluded.user_agent;
end $$;
create function public.remove_my_push_subscription(push_endpoint text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 delete from public.push_subscriptions where person_id=private.person_id() and endpoint=push_endpoint;
end $$;
revoke all on function public.save_my_push_subscription(jsonb),public.remove_my_push_subscription(text) from public,anon;
grant execute on function public.save_my_push_subscription(jsonb),public.remove_my_push_subscription(text) to authenticated;
