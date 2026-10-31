create table private.push_dispatch_tokens (
  singleton boolean primary key default true check(singleton),
  secret text not null
);
revoke all on private.push_dispatch_tokens from public,anon,authenticated;
insert into private.push_dispatch_tokens(singleton,secret) values(true,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));

create table private.push_delivery_receipts (
  person_id uuid not null references public.persons(id) on delete cascade,
  endpoint text not null,
  notification_key text not null,
  version text not null,
  delivered_at timestamptz not null default now(),
  primary key(person_id,endpoint,notification_key,version)
);
revoke all on private.push_delivery_receipts from public,anon,authenticated;

create function public.push_dispatch_secret() returns text
language sql stable security definer set search_path='' as $$
 select secret from private.push_dispatch_tokens where singleton
$$;
create function public.pending_push_notifications(batch_limit integer default 200)
returns table(person_id uuid,endpoint text,p256dh text,auth_secret text,notification_key text,version text,title text,body text,tab text,section text)
language plpgsql security definer set search_path='' as $$
declare account record; subscription record; feed jsonb; notice jsonb; page_number integer; pages integer; emitted integer:=0; auth_id uuid;
begin
 if batch_limit is null or batch_limit<1 or batch_limit>500 then raise exception 'invalid_batch' using errcode='22023'; end if;
 for account in
   select p.id,p.auth_user_id from public.persons p join auth.users u on u.id=p.auth_user_id
   where p.auth_user_id is not null and coalesce(u.raw_app_meta_data->>'must_change_password','false')<>'true'
   order by p.id
 loop
   auth_id:=account.auth_user_id;
   perform set_config('request.jwt.claim.sub',auth_id::text,true);
   perform set_config('request.jwt.claim.role','authenticated',true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',auth_id::text,'role','authenticated')::text,true);
   feed:=public.notification_feed(0);
   pages:=greatest(ceil(coalesce((feed->>'unread_count')::integer,0)::numeric/30)::integer,1);
   for page_number in 0..pages-1 loop
     feed:=public.notification_feed(page_number);
     for notice in select value from jsonb_array_elements(coalesce(feed->'items','[]'::jsonb)) where value->'read_at'='null'::jsonb loop
       for subscription in
         select s.endpoint,s.p256dh,s.auth_secret from public.push_subscriptions s
         where s.person_id=account.id and not exists(select 1 from private.push_delivery_receipts r where r.person_id=account.id and r.endpoint=s.endpoint and r.notification_key=notice->>'key' and r.version=notice->>'version')
       loop
         person_id:=account.id; endpoint:=subscription.endpoint; p256dh:=subscription.p256dh; auth_secret:=subscription.auth_secret;
         notification_key:=notice->>'key'; version:=notice->>'version'; title:=notice->>'title'; body:=notice->>'body'; tab:=notice->>'tab'; section:=notice->>'section';
         return next; emitted:=emitted+1;
         if emitted>=batch_limit then return; end if;
       end loop;
     end loop;
   end loop;
 end loop;
end $$;

create function public.record_push_delivery(target_person uuid,push_endpoint text,notification_key text,notification_version text) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into private.push_delivery_receipts(person_id,endpoint,notification_key,version)
 values(target_person,push_endpoint,notification_key,notification_version) on conflict do nothing;
end $$;
create function public.remove_dead_push_subscription(target_person uuid,push_endpoint text) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.push_subscriptions where person_id=target_person and endpoint=push_endpoint;
 delete from private.push_delivery_receipts where person_id=target_person and endpoint=push_endpoint;
end $$;
revoke all on function public.push_dispatch_secret(),public.pending_push_notifications(integer),public.record_push_delivery(uuid,text,text,text),public.remove_dead_push_subscription(uuid,text) from public,anon,authenticated;
grant execute on function public.push_dispatch_secret(),public.pending_push_notifications(integer),public.record_push_delivery(uuid,text,text,text),public.remove_dead_push_subscription(uuid,text) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('icabv-push-dispatch','* * * * *', $$
  select net.http_post(
    url:='https://ynkfmuseiancpnyloraf.supabase.co/functions/v1/dispatch-push',
    headers:=jsonb_build_object('content-type','application/json','x-icabv-push-token',(select secret from private.push_dispatch_tokens where singleton)),
    body:='{}'::jsonb
  );
$$);
