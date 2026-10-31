-- Compatibility storage for the existing main application. Single-church database.
create table public.management_records (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('member','transaction','event','schedule','notice','content','cell','prayer')),
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=20000),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index management_records_kind on public.management_records(kind);
alter table public.management_records enable row level security;
create function private.management_write(k text) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(array['admin']) or (k='transaction' and private.has_role(array['treasurer'])) or (k in ('member','event','notice','content','cell','prayer') and private.has_role(array['secretary']))
$$;
create policy management_read on public.management_records for select to authenticated using (
 private.has_role(array['admin']) or
 (kind='transaction' and private.has_role(array['treasurer'])) or
 (kind in ('member','schedule','event','notice','content','cell','prayer') and private.has_role(array['secretary'])) or
 (kind in ('notice','content','cell') and data->>'status'='Publicado') or kind='event' or
 (kind='member' and id=private.person_id()) or
 (kind='schedule' and data->>'memberId'=private.person_id()::text) or
 (kind='prayer' and data->>'authorId'=(select auth.uid())::text)
);
revoke all on public.management_records from anon,authenticated;
grant select on public.management_records to authenticated;
create function private.validate_management_payload(k text,p jsonb) returns void language plpgsql immutable set search_path='' as $$
declare field text; required_fields text[]; allowed_fields text[]; d date; t time;
begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>20000 then raise exception 'invalid_payload';end if;
 required_fields:=case k when 'member' then array['name'] when 'transaction' then array['description','direction','category','date','status'] when 'schedule' then array['ministry','duty','memberId','date','time','status'] when 'event' then array['title','date','time','location','status'] when 'cell' then array['title','leader','weekday','time','location','status'] else array['title','body','date','status'] end;
 allowed_fields:=case k when 'member' then array['name','email','phone','status','ministry','birthday','notes'] when 'transaction' then array['description','direction','amount','category','date','status','notes'] when 'event' then array['title','date','time','location','capacity','status','notes'] when 'schedule' then array['ministry','duty','memberId','eventId','date','time','status','notes'] when 'cell' then array['title','leader','weekday','time','location','description','contactUrl','status'] when 'content' then array['title','type','body','reference','speaker','url','date','status'] when 'prayer' then array['title','body','date','status','authorId','authorName'] else array['title','body','date','status'] end;
 for field in select jsonb_object_keys(p) loop
  if not(field=any(allowed_fields)) then raise exception 'invalid_field';end if;
  if field not in ('amount','capacity') and (jsonb_typeof(p->field)<>'string' or length(p->>field)>case when field='body' and k='content' then 12000 when field in ('body','notes','description') then 3000 when field in ('url','contactUrl') then 1500 else 180 end) then raise exception 'invalid_field';end if;
 end loop;
 foreach field in array required_fields loop
  if coalesce(length(trim(p->>field)),0)=0 then raise exception 'required_field';end if;
 end loop;
 if p?'date' then d:=(p->>'date')::date;if to_char(d,'YYYY-MM-DD')<>p->>'date' then raise exception 'invalid_date';end if;end if;
 if coalesce(p->>'birthday','')<>'' then d:=(p->>'birthday')::date;if to_char(d,'YYYY-MM-DD')<>p->>'birthday' then raise exception 'invalid_date';end if;end if;
 if p?'time' and (p->>'time')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_time';end if;
 if k='transaction' and (coalesce(jsonb_typeof(p->'amount'),'')<>'number' or coalesce(p->>'amount','')!~'^[0-9]+$' or (p->>'amount')::numeric not between 1 and 99999999999 or coalesce(p->>'direction','') not in ('Entrada','Saída') or p->>'status' not in ('Realizado','Pendente')) then raise exception 'invalid_transaction';end if;
 if k='event' and (coalesce(jsonb_typeof(p->'capacity'),'')<>'number' or coalesce(p->>'capacity','')!~'^[0-9]+$' or (p->>'capacity')::numeric not between 0 and 1000000 or p->>'status' not in ('Planejado','Confirmado','Cancelado')) then raise exception 'invalid_event';end if;
 if k='member' and coalesce(p->>'status','') not in ('Membro','Visitante','Inativo') then raise exception 'invalid_member';end if;
 if k in ('cell','notice','content') and p->>'status' not in ('Publicado','Rascunho') then raise exception 'invalid_publication';end if;
 if k='schedule' and p->>'status' not in ('Pendente','Confirmado','Indisponível') then raise exception 'invalid_schedule';end if;
 if k='prayer' and p->>'status' not in ('Aberto','Em oração','Concluído') then raise exception 'invalid_prayer';end if;
 if k='content' and coalesce(p->>'type','') not in ('Devocional','Pregação','Estudo','Culto ao vivo') then raise exception 'invalid_content';end if;
 foreach field in array array['url','contactUrl'] loop
  if coalesce(p->>field,'')<>'' and ((p->>field)!~'^https://[^/[:space:]@]+([/?#]|$)' or (p->>field)~'^https://[^/]*@') then raise exception 'invalid_url';end if;
 end loop;
end $$;
create function public.save_management_record(resource uuid,record_kind text,payload jsonb,expected_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.person_id(); current_record public.management_records; result uuid;
begin
 if actor is null or not private.management_write(record_kind) then raise exception 'forbidden' using errcode='42501';end if;
 perform private.validate_management_payload(record_kind,payload);
 -- Serialize relationship validation, edits and deletion across the compatibility module.
 perform pg_advisory_xact_lock(764210011);
 if resource is not null then
  select * into current_record from public.management_records where id=resource;
  if not found or current_record.kind<>record_kind then raise exception 'not_found';end if;
  if current_record.version is distinct from expected_version then raise exception 'version_conflict';end if;
 end if;
 if record_kind='prayer' then payload:=payload||jsonb_build_object('authorId',coalesce(current_record.data->>'authorId',auth.uid()::text),'authorName',coalesce(current_record.data->>'authorName',(select full_name from public.persons where id=actor)));end if;
 if record_kind='schedule' then
  if not exists(select 1 from public.management_records where id::text=payload->>'memberId' and kind='member' and data->>'status'<>'Inativo') then raise exception 'invalid_member';end if;
  if coalesce(payload->>'eventId','')<>'' and not exists(select 1 from public.management_records where id::text=payload->>'eventId' and kind='event' and data->>'status'<>'Cancelado') then raise exception 'invalid_event';end if;
  if payload->>'status'<>'IndisponÃ­vel' and exists(select 1 from public.management_records where kind='schedule' and id is distinct from resource and data->>'memberId'=payload->>'memberId' and data->>'date'=payload->>'date' and data->>'time'=payload->>'time' and data->>'status'<>'IndisponÃ­vel') then raise exception 'schedule_conflict';end if;
 end if;
 if resource is null then
  insert into public.management_records(kind,data) values(record_kind,payload) returning id into result;
 else
  update public.management_records set data=payload,version=version+1,updated_at=now() where id=resource returning id into result;
 end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'management.save',result);
 return result;
end $$;
create function public.delete_management_record(resource uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare target public.management_records;
begin
 perform pg_advisory_xact_lock(764210011);
 select * into target from public.management_records where id=resource;
 if not found or not private.management_write(target.kind) then raise exception 'forbidden' using errcode='42501';end if;
 if target.version is distinct from expected_version then raise exception 'version_conflict';end if;
 if exists(select 1 from public.management_records where kind='schedule' and (data->>'memberId'=resource::text or data->>'eventId'=resource::text)) then raise exception 'record_linked';end if;
 delete from public.management_records where id=resource;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'management.delete',resource);
end $$;
revoke all on function public.save_management_record(uuid,text,jsonb,integer),public.delete_management_record(uuid,integer) from public,anon;
grant execute on function public.save_management_record(uuid,text,jsonb,integer),public.delete_management_record(uuid,integer) to authenticated;
