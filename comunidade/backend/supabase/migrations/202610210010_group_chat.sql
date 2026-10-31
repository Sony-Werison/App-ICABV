-- Restricted group communication. No external push, attachments or public channel.
create table public.group_chat_messages (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.community_units(id),
 author_id uuid not null references public.persons(id), client_nonce uuid not null,
 body text not null check(length(trim(body)) between 1 and 2000),
 status text not null check(status in ('pending','published','hidden','withdrawn')),
 ever_published boolean not null default false, created_at timestamptz not null default now(),
 unique(author_id,client_nonce)
);
create index group_chat_unit_time on public.group_chat_messages(unit_id,created_at desc,id desc);
create table public.group_chat_reports (
 message_id uuid not null references public.group_chat_messages(id), person_id uuid not null references public.persons(id),
 reason text not null check(reason in ('inappropriate','spam','privacy')), created_at timestamptz not null default now(),
 primary key(message_id,person_id)
);
alter table public.group_chat_messages enable row level security;
alter table public.group_chat_reports enable row level security;
revoke all on public.group_chat_messages,public.group_chat_reports from anon,authenticated;
create function private.group_chat_access(unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.community_units u where u.id=unit and u.kind='group' and (private.unit_manager(unit) or private.unit_active(unit,private.person_id())))
$$;
revoke all on function private.group_chat_access(uuid) from public,anon,authenticated;

create function public.send_group_message(unit uuid,content text,nonce uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();existing public.group_chat_messages;result uuid;manager boolean;
begin
 perform 1 from public.community_units where id=unit for update;
 if not private.group_chat_access(unit) then raise exception 'unauthorized' using errcode='42501'; end if;
 if nonce is null or content is null or length(trim(content)) not between 1 and 2000 then raise exception 'invalid_message'; end if;
 select * into existing from public.group_chat_messages where author_id=actor and client_nonce=nonce;
 if found then
  if existing.unit_id<>unit or existing.body<>trim(content) then raise exception 'nonce_conflict'; end if;
  return existing.id;
 end if;
 if (select count(*) from public.group_chat_messages m where m.unit_id=unit and m.author_id=actor and m.created_at>now()-interval '1 minute')>=5 then raise exception 'message_rate_limit'; end if;
 manager:=private.unit_manager(unit);
 insert into public.group_chat_messages(unit_id,author_id,client_nonce,body,status,ever_published) values(unit,actor,nonce,trim(content),case when manager then 'published' else 'pending' end,manager) returning id into result;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.message_sent',result);return result;
end $$;

create function public.group_chat_page(unit uuid,cursor_id uuid,review boolean)
returns table(id uuid,body text,author_name text,created_at timestamptz,status text,is_mine boolean,report_count bigint,report_reasons text[])
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.core_actor();manager boolean:=private.unit_manager(unit);anchor public.group_chat_messages;
begin
 if not private.group_chat_access(unit) or review is null or (review and not manager) then raise exception 'unauthorized' using errcode='42501'; end if;
 if cursor_id is not null then
  select * into anchor from public.group_chat_messages m where m.id=cursor_id and m.unit_id=unit and (manager or m.status='published' or m.author_id=actor or (m.status='withdrawn' and m.ever_published));
  if not found then raise exception 'invalid_cursor'; end if;
 end if;
 return query select m.id,case when m.status='withdrawn' then null else m.body end,case when m.status='withdrawn' then null else p.full_name end,m.created_at,m.status,m.author_id=actor,
 case when manager then (select count(*) from public.group_chat_reports r where r.message_id=m.id) else null end,
 case when manager then (select array_agg(distinct r.reason order by r.reason) from public.group_chat_reports r where r.message_id=m.id) else null end
 from public.group_chat_messages m join public.persons p on p.id=m.author_id
 where m.unit_id=unit and (cursor_id is null or (m.created_at,m.id)<(anchor.created_at,anchor.id))
 and ((review and (m.status in ('pending','hidden') or (m.status='published' and exists(select 1 from public.group_chat_reports r where r.message_id=m.id))))
 or (not review and (m.status='published' or m.author_id=actor or (m.status='withdrawn' and m.ever_published))))
 order by m.created_at desc,m.id desc limit 21;
end $$;

create function public.moderate_group_message(message uuid,publish boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();m public.group_chat_messages;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_chat_messages where id=message) for update;
 select * into m from public.group_chat_messages where id=message for update;
 if not found or not private.unit_manager(m.unit_id) or publish is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if m.status='withdrawn' then raise exception 'message_withdrawn'; end if;
 update public.group_chat_messages set status=case when publish then 'published' else 'hidden' end,ever_published=ever_published or publish where id=message;
 delete from public.group_chat_reports where message_id=message;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,case when publish then 'group.message_published' else 'group.message_hidden' end,message);
end $$;

create function public.withdraw_group_message(message uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();m public.group_chat_messages;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_chat_messages where id=message) for update;
 select * into m from public.group_chat_messages where id=message for update;
 if not found or m.author_id<>actor or not private.group_chat_access(m.unit_id) then raise exception 'unauthorized' using errcode='42501'; end if;
 if m.status='withdrawn' then return; end if;
 update public.group_chat_messages set status='withdrawn' where id=message;
 delete from public.group_chat_reports where message_id=message;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.message_withdrawn',message);
end $$;

create function public.report_group_message(message uuid,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();m public.group_chat_messages;
begin
 perform 1 from public.community_units where id=(select unit_id from public.group_chat_messages where id=message) for update;
 select * into m from public.group_chat_messages where id=message for update;
 if not found or not private.group_chat_access(m.unit_id) or m.author_id=actor or m.status<>'published' then raise exception 'unauthorized' using errcode='42501'; end if;
 if reason is null or reason not in ('inappropriate','spam','privacy') then raise exception 'invalid_reason'; end if;
 insert into public.group_chat_reports(message_id,person_id,reason) values(message,actor,reason) on conflict(message_id,person_id) do nothing;
 if found then insert into public.audit_log(actor_id,action,resource_id) values(actor,'group.message_reported',message); end if;
end $$;
revoke all on function public.send_group_message(uuid,text,uuid),public.group_chat_page(uuid,uuid,boolean),public.moderate_group_message(uuid,boolean),public.withdraw_group_message(uuid),public.report_group_message(uuid,text) from public,anon;
grant execute on function public.send_group_message(uuid,text,uuid),public.group_chat_page(uuid,uuid,boolean),public.moderate_group_message(uuid,boolean),public.withdraw_group_message(uuid),public.report_group_message(uuid,text) to authenticated;
