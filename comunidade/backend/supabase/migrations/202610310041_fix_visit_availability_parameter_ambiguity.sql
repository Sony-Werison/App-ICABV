create or replace function public.save_visit_availability(
  availability_kind text,
  weekdays smallint[],
  available_dates date[],
  frequency integer,
  frequency_unit text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := private.person_id();
  requested_kind text := $1;
  selected_weekdays smallint[] := $2;
  selected_dates date[] := $3;
  selected_frequency integer := $4;
  selected_frequency_unit text := $5;
begin
  if actor is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  if requested_kind='visitor' then
    if selected_weekdays is null
      or cardinality(selected_weekdays) not between 1 and 7
      or not (selected_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
      or selected_frequency is null
      or selected_frequency not between 1 and 12
      or selected_frequency_unit is null
      or selected_frequency_unit not in ('week','month')
      or cardinality(coalesce(selected_dates,'{}'::date[]))<>0
    then
      raise exception 'invalid_availability' using errcode='22023';
    end if;
  elsif requested_kind='host' then
    if selected_weekdays is not null
      or selected_frequency is not null
      or selected_frequency_unit is not null
      or selected_dates is null
      or cardinality(selected_dates) not between 1 and 91
      or (select count(distinct d) from unnest(selected_dates) d)<>cardinality(selected_dates)
      or exists(select 1 from unnest(selected_dates) d where d<current_date or d>current_date+90)
    then
      raise exception 'invalid_availability' using errcode='22023';
    end if;
  else
    raise exception 'invalid_availability' using errcode='22023';
  end if;

  insert into public.visit_availability(
    person_id,availability_kind,weekdays,available_dates,frequency,frequency_unit,active,updated_at
  ) values (
    actor,requested_kind,selected_weekdays,coalesce(selected_dates,'{}'::date[]),selected_frequency,selected_frequency_unit,true,now()
  )
  on conflict on constraint visit_availability_pkey
  do update set
    weekdays=excluded.weekdays,
    available_dates=excluded.available_dates,
    frequency=excluded.frequency,
    frequency_unit=excluded.frequency_unit,
    active=true,
    updated_at=now();
end;
$$;

revoke all on function public.save_visit_availability(text,smallint[],date[],integer,text) from public,anon;
grant execute on function public.save_visit_availability(text,smallint[],date[],integer,text) to authenticated;
notify pgrst, 'reload schema';
