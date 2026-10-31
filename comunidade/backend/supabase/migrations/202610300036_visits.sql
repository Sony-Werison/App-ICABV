create table public.visit_availability (
  person_id uuid not null references public.persons(id) on delete cascade,
  availability_kind text not null check (availability_kind in ('visitor','host')),
  weekdays smallint[],
  available_dates date[] not null default '{}',
  frequency integer,
  frequency_unit text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (person_id, availability_kind),
  check ((availability_kind='visitor' and weekdays is not null and cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and frequency is not null and frequency between 1 and 12 and frequency_unit is not null and frequency_unit in ('week','month') and cardinality(available_dates)=0)
     or (availability_kind='host' and weekdays is null and available_dates is not null and cardinality(available_dates) between 1 and 91 and frequency is null and frequency_unit is null))
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.persons(id),
  host_id uuid not null references public.persons(id),
  visit_date date not null,
  visitor_outcome text check (visitor_outcome in ('completed','not_completed')),
  host_outcome text check (host_outcome in ('completed','not_completed')),
  visitor_justification text not null default '' check (length(visitor_justification)<=500),
  created_at timestamptz not null default now(),
  check (visitor_id <> host_id),
  unique (host_id, visit_date)
);
create index visits_visitor_date on public.visits(visitor_id, visit_date);
create index visits_host_date on public.visits(host_id, visit_date);

alter table public.visit_availability enable row level security;
alter table public.visits enable row level security;
create policy visit_availability_read on public.visit_availability for select to authenticated using(person_id=private.person_id() or private.manage_people());
create policy visits_participant_read on public.visits for select to authenticated using(visitor_id=private.person_id() or host_id=private.person_id() or private.manage_people());
revoke all on public.visit_availability, public.visits from public, anon, authenticated;
grant select on public.visit_availability, public.visits to authenticated;

create function public.save_visit_availability(availability_kind text, weekdays smallint[], available_dates date[], frequency integer, frequency_unit text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.person_id();
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if availability_kind='visitor' then
   if weekdays is null or cardinality(weekdays) not between 1 and 7 or not (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]) or frequency not between 1 and 12 or frequency_unit not in ('week','month') or cardinality(coalesce(available_dates,'{}'))<>0 then raise exception 'invalid_availability' using errcode='22023'; end if;
 elsif availability_kind='host' then
   if weekdays is not null or frequency is not null or frequency_unit is not null or available_dates is null or cardinality(available_dates) not between 1 and 91 or (select count(distinct d) from unnest(available_dates) d)<>cardinality(available_dates) or exists(select 1 from unnest(available_dates) d where d<current_date or d>current_date+90) then raise exception 'invalid_availability' using errcode='22023'; end if;
 else raise exception 'invalid_availability' using errcode='22023'; end if;
 insert into public.visit_availability(person_id,availability_kind,weekdays,available_dates,frequency,frequency_unit,active,updated_at)
 values(actor,availability_kind,weekdays,coalesce(available_dates,'{}'),frequency,frequency_unit,true,now())
 on conflict(person_id,availability_kind) do update set weekdays=excluded.weekdays,available_dates=excluded.available_dates,frequency=excluded.frequency,frequency_unit=excluded.frequency_unit,active=true,updated_at=now();
end $$;

create function public.my_visit_availability()
returns table(availability_kind text,weekdays smallint[],available_dates date[],frequency integer,frequency_unit text)
language sql stable security definer set search_path='' as $$
 select a.availability_kind,a.weekdays,a.available_dates,a.frequency,a.frequency_unit from public.visit_availability a where a.person_id=private.person_id() and a.active
$$;

create function public.remove_visit_availability(availability_kind text) returns void language plpgsql security definer set search_path='' as $$
declare requested_kind text := $1;
begin
 if private.person_id() is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if requested_kind not in ('visitor','host') then raise exception 'invalid_availability' using errcode='22023'; end if;
 update public.visit_availability set active=false,updated_at=now() where person_id=private.person_id() and visit_availability.availability_kind=requested_kind;
end $$;

create function public.visit_opportunities()
returns table(host_id uuid,host_name text,visit_date date,matching_my_availability boolean)
language sql stable security definer set search_path='' as $$
 with offered as (
   select p.id as host_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome') as host_name,d.visit_date
   from public.visit_availability a join public.persons p on p.id=a.person_id
   cross join lateral unnest(a.available_dates) d(visit_date)
   where a.availability_kind='host' and a.active and p.id<>private.person_id() and d.visit_date between current_date and current_date+90
 )
 select o.host_id,o.host_name,o.visit_date,coalesce(
   extract(isodow from o.visit_date)::smallint=any(v.weekdays) and
   ((v.frequency_unit='week' and floor((o.visit_date-date_trunc('week',current_date)::date)::numeric/7)::integer % v.frequency=0)
   or (v.frequency_unit='month' and ((extract(year from o.visit_date)::int-extract(year from current_date)::int)*12+extract(month from o.visit_date)::int-extract(month from current_date)::int) % v.frequency=0)),false)
 from offered o left join public.visit_availability v on v.person_id=private.person_id() and v.availability_kind='visitor' and v.active
 where not exists(select 1 from public.visits x where x.host_id=o.host_id and x.visit_date=o.visit_date)
 order by o.visit_date,o.host_name limit 120
$$;

create function public.claim_visit(host uuid, visit_on date) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.person_id(); result uuid;
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 if host=actor or visit_on<current_date or visit_on>current_date+90 then raise exception 'invalid_visit' using errcode='22023'; end if;
 if not exists(select 1 from public.visit_availability a where a.person_id=host and a.availability_kind='host' and a.active and visit_on=any(a.available_dates)) then raise exception 'opportunity_unavailable' using errcode='22023'; end if;
 insert into public.visits(visitor_id,host_id,visit_date) values(actor,host,visit_on) returning id into result;
 return result;
exception when unique_violation then raise exception 'opportunity_taken' using errcode='23505';
end $$;

create function public.my_visits()
returns table(id uuid,visitor_id uuid,visitor_name text,host_id uuid,host_name text,visit_date date,visitor_outcome text,host_outcome text,visitor_justification text)
language sql stable security definer set search_path='' as $$
 select v.id,v.visitor_id,coalesce(nullif(vp.full_name,''),'Pessoa sem nome'),v.host_id,coalesce(nullif(hp.full_name,''),'Pessoa sem nome'),v.visit_date,v.visitor_outcome,v.host_outcome,v.visitor_justification
 from public.visits v join public.persons vp on vp.id=v.visitor_id join public.persons hp on hp.id=v.host_id
 where v.visitor_id=private.person_id() or v.host_id=private.person_id() or private.manage_people()
 order by v.visit_date desc,v.created_at desc limit 200
$$;

create function public.report_visit_outcome(visit uuid, outcome text, justification text) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.person_id(); row_visit public.visits; reason text:=coalesce(trim(justification),'');
begin
 if actor is null then raise exception 'unauthorized' using errcode='42501'; end if;
 select * into row_visit from public.visits where id=visit for update;
 if row_visit.id is null or actor not in(row_visit.visitor_id,row_visit.host_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if row_visit.visit_date>current_date then raise exception 'visit_not_due' using errcode='22023'; end if;
 if outcome not in ('completed','not_completed') then raise exception 'invalid_outcome' using errcode='22023'; end if;
 if length(reason)>500 or (actor=row_visit.visitor_id and outcome='not_completed' and length(reason)<5) then raise exception 'justification_required' using errcode='22023'; end if;
 if actor=row_visit.visitor_id then update public.visits set visitor_outcome=outcome,visitor_justification=case when outcome='not_completed' then reason else '' end where id=visit;
 else update public.visits set host_outcome=outcome where id=visit; end if;
end $$;

revoke all on function public.save_visit_availability(text,smallint[],date[],integer,text),public.my_visit_availability(),public.remove_visit_availability(text),public.visit_opportunities(),public.claim_visit(uuid,date),public.my_visits(),public.report_visit_outcome(uuid,text,text) from public,anon;
grant execute on function public.save_visit_availability(text,smallint[],date[],integer,text),public.my_visit_availability(),public.remove_visit_availability(text),public.visit_opportunities(),public.claim_visit(uuid,date),public.my_visits(),public.report_visit_outcome(uuid,text,text) to authenticated;
