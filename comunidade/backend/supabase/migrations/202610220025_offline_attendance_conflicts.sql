-- Keep an offline attendance record from silently replacing a more recent call.
create or replace function public.sync_operation(operation_id uuid,command jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.person_id(); previous public.client_operations; digest text:=md5(command::text);
 result jsonb; fragment jsonb; fn record; matches integer; arg record; relation regclass; field text; typename text;
 cols text:=''; definitions text:=''; call_args text:=''; filters text:=''; updates text:=''; conflict text:='';
 row_data jsonb; body jsonb; mode text:=command->>'method'; target text:=command->>'target'; expression text;
begin
 if actor is null or operation_id is null then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(command)<>'object' or length(command::text)>24000000 then raise exception 'invalid_operation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||operation_id::text,0));
 select * into previous from public.client_operations r where r.person_id=actor and r.operation_id=sync_operation.operation_id;
 if found then
  if previous.fingerprint<>digest then raise exception 'operation_conflict'; end if;
  return previous.result;
 end if;
 if command->>'kind'='rpc' then
  if target='sync_operation' or jsonb_typeof(command->'body')<>'object' then raise exception 'invalid_operation'; end if;
  select count(*) into matches from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=target and p.prokind='f' and not p.proretset and p.provolatile='v'
   and pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
   and not exists(select 1 from jsonb_object_keys(command->'body') k where not(k=any(coalesce(p.proargnames,'{}'))))
   and not exists(select 1 from generate_series(1,p.pronargs-p.pronargdefaults) i where not(command->'body' ? p.proargnames[i]));
  if matches<>1 then raise exception 'unsupported_operation'; end if;
  select p.* into fn from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=target and p.prokind='f' and not p.proretset and p.provolatile='v'
   and pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE')
   and not exists(select 1 from jsonb_object_keys(command->'body') k where not(k=any(coalesce(p.proargnames,'{}'))))
   and not exists(select 1 from generate_series(1,p.pronargs-p.pronargdefaults) i where not(command->'body' ? p.proargnames[i]));
  for arg in select i,fn.proargnames[i] as name,pg_catalog.format_type(fn.proargtypes[i-1],null) as type from generate_series(1,fn.pronargs) i loop
   if command->'body' ? arg.name then
    definitions:=definitions||case when definitions='' then '' else ',' end||format('%I %s',arg.name,arg.type);
    call_args:=call_args||case when call_args='' then '' else ',' end||format('%I => args.%I',arg.name,arg.name);
   end if;
  end loop;
  expression:=format('select to_jsonb(public.%I(%s))',target,call_args);
  if definitions<>'' then expression:=expression||format(' from jsonb_to_record($1) as args(%s)',definitions); end if;
  execute expression into result using command->'body';
 elsif command->>'kind'='table' then
  if target !~ '^[a-z][a-z0-9_]*$' or target='client_operations' then raise exception 'unsupported_operation'; end if;
  select c.oid::regclass into relation from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname=target and c.relkind='r';
  if relation is null or mode not in ('POST','PATCH','DELETE') then raise exception 'unsupported_operation'; end if;
  for field,fragment in select * from jsonb_each(coalesce(command->'filters','{}')) loop
   select pg_catalog.format_type(a.atttypid,a.atttypmod) into typename from pg_catalog.pg_attribute a where a.attrelid=relation and a.attname=field and a.attnum>0 and not a.attisdropped;
   if typename is null then raise exception 'invalid_filter'; end if;
   if fragment->>'op'='eq' then expression:=format('t.%I = ($1->''filters''->%L->>''value'')::%s',field,field,typename);
   elsif fragment->>'op'='in' then expression:=format('t.%I in (select v::%s from jsonb_array_elements_text($1->''filters''->%L->''value'') v)',field,typename,field);
   elsif fragment->>'op'='is' and fragment->'value'='null'::jsonb then expression:=format('t.%I is null',field);
   else raise exception 'unsupported_filter'; end if;
   filters:=filters||case when filters='' then '' else ' and ' end||expression;
  end loop;
  if mode in ('PATCH','DELETE') and filters='' then raise exception 'filter_required'; end if;
  if command->'expected' is not null then
   if target<>'ebd_attendance' or jsonb_typeof(command->'expected'->'match')<>'object' then raise exception 'invalid_operation'; end if;
   expression:='';
   for field in select jsonb_object_keys(command->'expected'->'match') loop
    select pg_catalog.format_type(a.atttypid,a.atttypmod) into typename from pg_catalog.pg_attribute a where a.attrelid=relation and a.attname=field and a.attnum>0 and not a.attisdropped;
    if typename is null then raise exception 'invalid_filter'; end if;
    expression:=expression||case when expression='' then '' else ' and ' end||format('t.%I = ($1->''expected''->''match''->>%L)::%s',field,field,typename);
   end loop;
   if expression='' then raise exception 'invalid_filter'; end if;
   execute format('select to_jsonb(t) from %s t where %s for update',relation,expression) into fragment using command;
   if coalesce((command->'expected'->>'exists')::boolean,false)<>(fragment is not null) then raise exception 'offline_conflict'; end if;
   if fragment is not null then
    for field,row_data in select * from jsonb_each(command->'expected'->'values') loop
     if fragment->field is distinct from row_data then raise exception 'offline_conflict'; end if;
    end loop;
   end if;
  end if;
  body:=command->'body'; result:='[]';
  if mode='DELETE' then
   execute format('with changed as (delete from %s t where %s returning t.*) select coalesce(jsonb_agg(to_jsonb(changed)),''[]'') from changed',relation,filters) into result using command;
  else
   if mode='PATCH' and jsonb_typeof(body)<>'object' then raise exception 'invalid_data'; end if;
   if jsonb_typeof(body)='object' then body:=jsonb_build_array(body); end if;
   if jsonb_typeof(body)<>'array' or jsonb_array_length(body)>1000 then raise exception 'invalid_data'; end if;
   for row_data in select * from jsonb_array_elements(body) loop
    cols:=''; updates:='';
    for field in select jsonb_object_keys(row_data) loop
     if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=relation and a.attname=field and a.attnum>0 and not a.attisdropped and a.attgenerated='') then raise exception 'invalid_column'; end if;
     cols:=cols||case when cols='' then '' else ',' end||format('%I',field);
     updates:=updates||case when updates='' then '' else ',' end||case when mode='PATCH' then format('%I = v.%I',field,field) else format('%I = excluded.%I',field,field) end;
    end loop;
    if cols='' then raise exception 'invalid_data'; end if;
    if mode='PATCH' then
     expression:=format('update %s t set %s from jsonb_populate_record(null::%s,$2) v where %s returning t.*',relation,updates,relation,filters);
    else
     conflict:='';
     if command->>'resolution' in ('merge-duplicates','ignore-duplicates') then
      if coalesce(command->>'on_conflict','')<>'' then
       for field in select unnest(string_to_array(command->>'on_conflict',',')) loop
        if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=relation and a.attname=field and a.attnum>0 and not a.attisdropped) then raise exception 'invalid_conflict'; end if;
        conflict:=conflict||case when conflict='' then '' else ',' end||format('%I',field);
       end loop;
      else
       select string_agg(format('%I',a.attname),',' order by k.ordinality) into conflict from pg_catalog.pg_index ix cross join lateral unnest(ix.indkey) with ordinality k(attnum,ordinality) join pg_catalog.pg_attribute a on a.attrelid=ix.indrelid and a.attnum=k.attnum where ix.indrelid=relation and ix.indisprimary;
      end if;
      if conflict is null or conflict='' then raise exception 'invalid_conflict'; end if;
      conflict:=format(' on conflict (%s) do ',conflict)||case when command->>'resolution'='ignore-duplicates' then 'nothing' else 'update set '||updates end;
     end if;
     expression:=format('insert into %s as t (%s) select %s from jsonb_populate_record(null::%s,$2) v%s returning t.*',relation,cols,(select string_agg('v.'||quote_ident(k),',') from jsonb_object_keys(row_data) k),relation,conflict);
    end if;
    execute 'with changed as ('||expression||') select coalesce(jsonb_agg(to_jsonb(changed)),''[]'') from changed' into fragment using command,row_data;
    result:=result||fragment;
   end loop;
  end if;
 else raise exception 'unsupported_operation'; end if;
 result:=coalesce(result,'null'::jsonb);
 insert into public.client_operations(person_id,operation_id,fingerprint,result) values(actor,operation_id,digest,result);
 return result;
end $$;
