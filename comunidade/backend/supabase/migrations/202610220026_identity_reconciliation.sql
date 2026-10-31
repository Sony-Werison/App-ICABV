-- Explicit administrator review. Account IDs remain stable; imported records move to them.
alter table public.persons add column merged_into uuid references public.persons(id);
alter table public.persons add check(merged_into is null or (merged_into<>id and auth_user_id is null));
create table public.identity_reviews (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.persons(id),
 target_id uuid not null references public.persons(id), decision text not null check(decision in ('merged','distinct')),
 reason text not null check(length(trim(reason)) between 10 and 2000), actor_id uuid not null references public.persons(id),
 snapshot jsonb not null, created_at timestamptz not null default now(), check(source_id<>target_id)
);
alter table public.identity_reviews enable row level security;
create policy identity_review_admin on public.identity_reviews for select to authenticated using(private.has_role(array['admin']));
revoke all on public.identity_reviews from public,anon,authenticated;
grant select on public.identity_reviews to authenticated;

create function private.identity_name(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(translate(lower(trim(value)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]','','g')
$$;
create function private.identity_card(person uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.full_name,'membership',p.membership_status,
 'account_email',u.email,'verified',u.email_confirmed_at is not null,'has_account',p.auth_user_id is not null,
 'contacts',(select to_jsonb(c)-'person_id' from public.person_contacts c where c.person_id=p.id),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('system',l.source_system,'id',l.legacy_id) order by l.source_system,l.legacy_id) from public.legacy_person_records l where l.person_id=p.id),'[]'),
 'roles',coalesce((select jsonb_agg(r.role order by r.role) from public.role_assignments r where r.person_id=p.id),'[]'),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('name',c.name,'role',m.role) order by c.name) from public.ebd_class_members m join public.ebd_classes c on c.id=m.class_id where m.person_id=p.id),'[]'),
 'history_count',(select count(*) from public.ebd_legacy_history h where h.person_id=p.id),
 'attendance_count',(select count(*) from public.ebd_attendance a where a.person_id=p.id),
 'guardian_count',(select count(*) from public.ebd_guardians g where g.guardian_id=p.id),
 'worship',(select to_jsonb(w)-'person_id' from public.worship_members w where w.person_id=p.id))
 from public.persons p left join auth.users u on u.id=p.auth_user_id where p.id=person
$$;

create function public.identity_directory(search_text text default '',page_number integer default 0, list_mode text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501';end if;
 if page_number is null or page_number<0 or page_number>100000 or length(search_text)>120 or list_mode not in ('all','accounts','imported') then raise exception 'invalid_data';end if;
 select coalesce(jsonb_agg(private.identity_card(x.id) order by x.full_name,x.id),'[]') into result from (
 select p.id,p.full_name from public.persons p left join auth.users u on u.id=p.auth_user_id left join public.person_contacts c on c.person_id=p.id
 where p.merged_into is null and (list_mode<>'accounts' or p.auth_user_id is not null)
 and (list_mode<>'imported' or (p.auth_user_id is null and exists(select 1 from public.legacy_person_records l where l.person_id=p.id)))
 and (trim(search_text)='' or position(lower(trim(search_text)) in lower(p.full_name||' '||coalesce(u.email,'')||' '||coalesce(c.email,'')||' '||coalesce(c.phone,'')))>0 or p.id::text=trim(search_text))
 order by p.full_name,p.id limit 26 offset page_number*25) x;
 return jsonb_build_object('items',result);
end $$;

create function public.identity_duplicates(page_number integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501';end if;
 if page_number is null or page_number<0 or page_number>100000 then raise exception 'invalid_data';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('left',private.identity_card(x.a),'right',private.identity_card(x.b),'name_match',x.n,'email_match',x.e,'phone_match',x.ph) order by x.a,x.b) from (
 select a.id a,b.id b,private.identity_name(a.full_name)<>'' and private.identity_name(a.full_name)=private.identity_name(b.full_name) n,
 coalesce(nullif(lower(trim(ca.email)),''),'!a')=coalesce(nullif(lower(trim(cb.email)),''),'!b') or coalesce(nullif(lower(ua.email),''),'!a')=coalesce(nullif(lower(trim(cb.email)),''),'!b') or coalesce(nullif(lower(ub.email),''),'!a')=coalesce(nullif(lower(trim(ca.email)),''),'!b') e,
 length(regexp_replace(coalesce(ca.phone,''),'\D','','g'))>=8 and regexp_replace(ca.phone,'\D','','g')=regexp_replace(cb.phone,'\D','','g') ph
 from public.persons a join public.persons b on a.id<b.id
 left join public.person_contacts ca on ca.person_id=a.id left join public.person_contacts cb on cb.person_id=b.id
 left join auth.users ua on ua.id=a.auth_user_id left join auth.users ub on ub.id=b.auth_user_id
 where a.merged_into is null and b.merged_into is null and (exists(select 1 from public.legacy_person_records l where l.person_id in (a.id,b.id)))
 and not exists(select 1 from public.identity_reviews r where r.decision='distinct' and ((r.source_id=a.id and r.target_id=b.id) or (r.source_id=b.id and r.target_id=a.id)))
 and ((private.identity_name(a.full_name)<>'' and private.identity_name(a.full_name)=private.identity_name(b.full_name))
 or (nullif(lower(trim(ca.email)),'')=nullif(lower(trim(cb.email)),'')) or nullif(lower(ua.email),'')=nullif(lower(trim(cb.email)),'') or nullif(lower(ub.email),'')=nullif(lower(trim(ca.email)),'')
 or (length(regexp_replace(coalesce(ca.phone,''),'\D','','g'))>=8 and regexp_replace(ca.phone,'\D','','g')=regexp_replace(cb.phone,'\D','','g')))
 order by a.id,b.id limit 26 offset page_number*25) x),'[]');
end $$;

-- A fingerprint covers all affected rows, including embedded worship assignments.
-- Differing unique rows require an explicit per-row choice. Unhandled financial or
-- externally referenced collisions block the transaction rather than discard data.
create function private.identity_plan(source_person uuid,target_person uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tbl record; col text; original jsonb; changed jsonb; other jsonb; candidate jsonb; uk record;
 rows jsonb; actions jsonb:='[]'; conflicts jsonb:='[]'; impact jsonb:='[]'; expression text; key text; identical boolean; allowed boolean;
 source_card jsonb:=private.identity_card(source_person);target_card jsonb:=private.identity_card(target_person);services jsonb;
begin
 if source_person=target_person or source_card is null or target_card is null then raise exception 'invalid_pair';end if;
 if exists(select 1 from public.persons where id in(source_person,target_person) and merged_into is not null) then raise exception 'identity_already_merged';end if;
 if (source_card->>'has_account')::boolean then raise exception 'source_has_account';end if;
 if (target_card->>'has_account')::boolean and not(target_card->>'verified')::boolean then raise exception 'account_not_verified';end if;
 if not exists(select 1 from public.legacy_person_records where person_id in(source_person,target_person)) then raise exception 'imported_person_required';end if;
 for tbl in
 select c.conrelid::regclass relation,t.relname,array_agg(distinct a.attname::text order by a.attname::text) columns
 from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid
 join pg_catalog.pg_namespace n on n.oid=t.relnamespace
 join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 where c.contype='f' and c.confrelid='public.persons'::regclass and n.nspname='public'
 and t.relname not in('persons','identity_reviews','audit_log','module_import_runs') group by c.conrelid,t.relname order by t.relname
 loop
  select string_agg(format('t.%I=$1',v),' or ') into expression from unnest(tbl.columns) v;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from %s t where %s',tbl.relation,expression) into rows using source_person;
  if jsonb_array_length(rows)=0 then continue;end if;
  impact:=impact||jsonb_build_array(jsonb_build_object('table',tbl.relname,'count',jsonb_array_length(rows)));
  for original in select value from jsonb_array_elements(rows) loop
   changed:=original;
   foreach col in array tbl.columns loop
    if changed->>col=source_person::text then changed:=jsonb_set(changed,array[col],to_jsonb(target_person::text));end if;
   end loop;
   other:=null;
   for uk in select c.conkey from pg_catalog.pg_constraint c where c.conrelid=tbl.relation and c.contype in('p','u') loop
    select string_agg(format('(to_jsonb(t)->%L)=$1->%L and $1->%L<>''null''::jsonb',a.attname,a.attname,a.attname),' and ') into expression
    from pg_catalog.pg_attribute a where a.attrelid=tbl.relation and a.attnum=any(uk.conkey);
    execute format('select to_jsonb(t) from %s t where %s and to_jsonb(t)<>$2 limit 1',tbl.relation,expression) into candidate using changed,original;
    if candidate is not null then
     if other is not null and other<>candidate then raise exception 'complex_identity_collision';end if;
     other:=candidate;
    end if;
   end loop;
   key:=md5(tbl.relname||original::text);
   if other is not null then
    identical:=(changed-'id'-'created_at'-'granted_by')=(other-'id'-'created_at'-'granted_by');
    allowed:=tbl.relname=any(array['person_contacts','worship_members','role_assignments','family_members','module_access','ebd_class_members','ebd_guardians','ebd_attendance','ebd_submissions','ebd_activity_starts','notification_reads']);
    if not identical or not allowed then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('key',key,'table',tbl.relname,'source',changed,'target',other,'resolvable',allowed));end if;
   else identical:=false;end if;
   actions:=actions||jsonb_build_array(jsonb_build_object('table',tbl.relname,'columns',to_jsonb(tbl.columns),'before',original,'after',changed,'collision',other,'identical',identical and allowed,'key',key));
  end loop;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') into services from public.worship_services s where s.assignments::text like '%'||source_person::text||'%';
 return jsonb_build_object('source',source_card,'target',target_card,'actions',actions,'conflicts',conflicts,'impact',impact,'services',services,
 'profile_choice',coalesce(source_card->>'name','')<>coalesce(target_card->>'name','') and coalesce(source_card->>'name','')<>'' and coalesce(target_card->>'name','')<>'');
end $$;

create function public.identity_preview(source_person uuid,target_person uuid) returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='30s' as $$
declare plan jsonb;
begin
 if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501';end if;
 plan:=private.identity_plan(source_person,target_person);
 return (plan-'actions'-'services')||jsonb_build_object('fingerprint',md5(plan::text),'service_count',jsonb_array_length(plan->'services'));
end $$;

create function public.review_identity(source_person uuid,target_person uuid,review_decision text,review_reason text,expected_fingerprint text default '',choices jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' set statement_timeout='60s' as $$
declare actor uuid:=private.person_id();plan jsonb;a jsonb;c jsonb;col text;changes text;resolution text;result uuid;source_row public.persons;target_row public.persons;
begin
 if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501';end if;
 if review_decision not in ('merged','distinct') or review_decision is null or length(trim(review_reason)) not between 10 and 2000 or review_reason is null or choices is null or jsonb_typeof(choices)<>'object' then raise exception 'review_required';end if;
 -- Serialize reviews and block concurrent writes to the affected domain tables
 -- until the fresh preview fingerprint has been checked and all changes commit.
 perform pg_advisory_xact_lock(20261026);
 perform 1 from public.persons where id in(source_person,target_person) order by id for update;
 select * into source_row from public.persons where id=source_person;
 select * into target_row from public.persons where id=target_person;
 if source_person=target_person or source_row.id is null or target_row.id is null or source_row.merged_into is not null or target_row.merged_into is not null then raise exception 'invalid_pair';end if;
 if review_decision='distinct' then
  insert into public.identity_reviews(source_id,target_id,decision,reason,actor_id,snapshot) values(source_person,target_person,'distinct',trim(review_reason),actor,jsonb_build_object('source',private.identity_card(source_person),'target',private.identity_card(target_person))) returning id into result;
 else
  for a in select jsonb_build_object('table',t.relname) from pg_catalog.pg_class t join pg_catalog.pg_namespace n on n.oid=t.relnamespace
   where n.nspname='public' and t.relkind='r' and (t.oid in(select conrelid from pg_catalog.pg_constraint where contype='f' and confrelid='public.persons'::regclass) or t.relname in('worship_services','legacy_mapping')) order by t.relname loop
   execute format('lock table public.%I in share row exclusive mode',a->>'table');
  end loop;
  plan:=private.identity_plan(source_person,target_person);
  if expected_fingerprint is distinct from md5(plan::text) then raise exception 'identity_version_conflict';end if;
  if (plan->>'profile_choice')::boolean and coalesce(choices->>'profile','') not in('source','target') then raise exception 'identity_choice_required';end if;
  for c in select value from jsonb_array_elements(plan->'conflicts') loop
   if not(c->>'resolvable')::boolean then raise exception 'identity_collision_requires_manual_review';end if;
   if coalesce(choices->>(c->>'key'),'') not in('source','target') then raise exception 'identity_choice_required';end if;
  end loop;
  -- Store originals before resolving collisions; source identity remains archived.
  insert into public.identity_reviews(source_id,target_id,decision,reason,actor_id,snapshot) values(source_person,target_person,'merged',trim(review_reason),actor,plan||jsonb_build_object('choices',choices)) returning id into result;
  for a in select value from jsonb_array_elements(plan->'actions') loop
   if a->'collision'<>'null'::jsonb then
    resolution:=case when (a->>'identical')::boolean then 'target' else choices->>(a->>'key') end;
    if resolution='source' then
     select string_agg(format('%I=r.%I',v.key,v.key),',') into changes from jsonb_each(a->'after') v where v.key<>'id';
     execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t)=$2',a->>'table',changes,a->>'table') using a->'after',a->'collision';
    end if;
    execute format('delete from public.%I t where to_jsonb(t)=$1',a->>'table') using a->'before';
   else
    select string_agg(format('%I=r.%I',v#>>'{}',v#>>'{}'),',') into changes from jsonb_array_elements(a->'columns') v;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t)=$2',a->>'table',changes,a->>'table') using a->'after',a->'before';
   end if;
  end loop;
  -- Never archive an identity if a row changed underneath another planned action.
  for a in select value from jsonb_array_elements(plan->'impact') loop
   select string_agg(format('t.%I=$1',v#>>'{}'),' or ') into changes
    from jsonb_array_elements((select x->'columns' from jsonb_array_elements(plan->'actions') x where x->>'table'=a->>'table' limit 1)) v;
   execute format('select exists(select 1 from public.%I t where %s)',a->>'table',changes) into resolution using source_person;
   if resolution::boolean then raise exception 'identity_collision_requires_manual_review';end if;
  end loop;
  update public.persons set merged_into=target_person where id=source_person;
  -- Person IDs embedded in worship JSON are not foreign keys. Replace exact IDs.
  update public.worship_services s set assignments=(select jsonb_object_agg(x.key,(select coalesce(jsonb_agg(v.id order by v.first_position),'[]') from (select case when p.value=source_person::text then target_person::text else p.value end id,min(p.ordinality) first_position from jsonb_array_elements_text(x.value) with ordinality p group by 1) v)) from jsonb_each(s.assignments) x)
   where s.assignments::text like '%'||source_person::text||'%';
  update public.legacy_mapping set canonical_id=target_person where entity_type='person' and canonical_id=source_person;
  update public.persons set full_name=case when full_name='' or choices->>'profile'='source' then source_row.full_name else full_name end where id=target_person;
 end if;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'identity.'||review_decision,result);
 return result;
end $$;

create or replace function private.validate_worship_service() returns trigger language plpgsql security definer set search_path='' as $$
declare v text; ids jsonb; previous jsonb;
begin
 if exists(select 1 from unnest(new.playlist) i where not exists(select 1 from public.worship_songs s where s.id=i)) then raise exception 'invalid_playlist';end if;
 if tg_op='UPDATE' then previous:=old.assignments;else previous:='{}';end if;
 for v,ids in select * from jsonb_each(new.assignments) loop
  if length(v)>80 or jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)>50 then raise exception 'invalid_assignments';end if;
  if exists(select 1 from jsonb_array_elements_text(ids) i where not exists(select 1 from public.worship_members m where m.person_id::text=i and (m.active or exists(select 1 from jsonb_each(previous) old_role,jsonb_array_elements_text(old_role.value) old_id where old_id.value=i or exists(select 1 from public.persons old_person where old_person.id::text=old_id.value and old_person.merged_into::text=i))))) then raise exception 'invalid_member';end if;
 end loop;return new;
end $$;

-- Archived identities remain for provenance, but cannot receive new domain data.
create function private.guard_merged_person() returns trigger language plpgsql security definer set search_path='' as $$
declare col text;person uuid;
begin
 foreach col in array tg_argv loop
  person:=(to_jsonb(new)->>col)::uuid;
  if exists(select 1 from public.persons where id=person and merged_into is not null) then
   if tg_op='INSERT' then raise exception 'identity_already_merged';end if;
   if to_jsonb(old)->>col is distinct from person::text then raise exception 'identity_already_merged';end if;
  end if;
 end loop;return new;
end $$;
do $$ declare t record;args text;begin
 for t in select c.conrelid::regclass relation,array_agg(distinct a.attname::text order by a.attname::text) columns from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
 where c.contype='f' and c.confrelid='public.persons'::regclass and c.conrelid not in('public.persons'::regclass,'public.identity_reviews'::regclass,'public.audit_log'::regclass,'public.module_import_runs'::regclass) group by c.conrelid loop
 select string_agg(quote_literal(v),',') into args from unnest(t.columns) v;
 execute format('create trigger identity_active_person before insert or update on %s for each row execute function private.guard_merged_person(%s)',t.relation,args);
 end loop;
end $$;
create or replace function public.module_people(target_module text) returns table(id uuid,full_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null or not private.module_manager(target_module) then raise exception 'forbidden' using errcode='42501';end if;
 return query select p.id,coalesce(nullif(p.full_name,''),case when p.id=private.person_id() then 'Minha conta' else 'Pessoa sem nome · '||left(p.id::text,8) end) from public.persons p where p.merged_into is null order by p.full_name,p.id;
end $$;
revoke all on function private.identity_name(text),private.identity_card(uuid),private.identity_plan(uuid,uuid),private.guard_merged_person() from public,anon,authenticated;
revoke all on function public.identity_directory(text,integer,text),public.identity_duplicates(integer),public.identity_preview(uuid,uuid),public.review_identity(uuid,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.identity_directory(text,integer,text),public.identity_duplicates(integer),public.identity_preview(uuid,uuid),public.review_identity(uuid,uuid,text,text,text,jsonb) to authenticated;

create function public.identity_review_history(page_number integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_role(array['admin']) then raise exception 'forbidden' using errcode='42501';end if;
 if page_number is null or page_number<0 or page_number>100000 then raise exception 'invalid_data';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (
 select r.id,r.decision,r.reason,r.created_at,r.snapshot->'source' source,r.snapshot->'target' target,r.snapshot->'choices' choices,r.snapshot->'conflicts' conflicts
 from public.identity_reviews r order by r.created_at desc,r.id limit 21 offset page_number*20) x),'[]');
end $$;
revoke all on function public.identity_review_history(integer) from public,anon;
grant execute on function public.identity_review_history(integer) to authenticated;
