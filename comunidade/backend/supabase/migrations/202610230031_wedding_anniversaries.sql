-- Keep wedding anniversaries distinct from birth dates and personal profile sharing.
alter table public.document_birthdays add column anniversary_type text not null default 'birthday' check(anniversary_type in ('birthday','wedding'));
alter table public.document_birthdays add constraint document_wedding_has_no_person check(anniversary_type<>'wedding' or person_id is null);

create or replace function public.birthday_calendar(month_number integer,page_number integer default 0)
returns table(person_id uuid,full_name text,birth_day integer,birth_month integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'forbidden' using errcode='42501'; end if;
 if month_number not between 1 and 12 or month_number is null or page_number is null or page_number<0 or page_number>100000 then raise exception 'invalid_data'; end if;
 return query with entries as (
  select p.id,p.full_name,extract(day from c.birth_date)::integer as day,extract(month from c.birth_date)::integer as month
  from public.person_contacts c join public.persons p on p.id=c.person_id
  where c.share_birthday and p.merged_into is null and extract(month from c.birth_date)=month_number
  union all
  select coalesce(d.person_id,d.id),coalesce(p.full_name,d.display_name),d.birth_day,d.birth_month
  from public.document_birthdays d left join public.persons p on p.id=d.person_id
  where d.anniversary_type='birthday' and d.visible and d.birth_month=month_number and (d.person_id is null or p.merged_into is null)
   and not exists(select 1 from public.person_contacts c where c.person_id=d.person_id and c.share_birthday and c.birth_date is not null)
 ) select e.id,e.full_name,e.day,e.month from entries e
 order by (e.month=extract(month from now() at time zone 'America/Sao_Paulo') and e.day=extract(day from now() at time zone 'America/Sao_Paulo')) desc,e.day,e.full_name,e.id
 limit 100 offset page_number*100;
end $$;

create or replace function public.anniversary_calendar(month_number integer,page_number integer default 0)
returns table(person_id uuid,full_name text,birth_day integer,birth_month integer,anniversary_type text)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null then raise exception 'forbidden' using errcode='42501'; end if;
 if month_number not between 1 and 12 or month_number is null or page_number is null or page_number<0 or page_number>100000 then raise exception 'invalid_data'; end if;
 return query with entries as (
  select p.id,p.full_name,extract(day from c.birth_date)::integer as day,extract(month from c.birth_date)::integer as month,'birthday'::text as type
  from public.person_contacts c join public.persons p on p.id=c.person_id
  where c.share_birthday and p.merged_into is null and extract(month from c.birth_date)=month_number
  union all
  select coalesce(d.person_id,d.id),coalesce(p.full_name,d.display_name),d.birth_day,d.birth_month,d.anniversary_type
  from public.document_birthdays d left join public.persons p on p.id=d.person_id
  where d.visible and d.birth_month=month_number and (d.person_id is null or p.merged_into is null)
   and not exists(select 1 from public.person_contacts c where c.person_id=d.person_id and c.share_birthday and c.birth_date is not null)
 ) select e.id,e.full_name,e.day,e.month,e.type from entries e
 order by (e.month=extract(month from now() at time zone 'America/Sao_Paulo') and e.day=extract(day from now() at time zone 'America/Sao_Paulo')) desc,e.day,e.full_name,e.id
 limit 100 offset page_number*100;
end $$;

revoke all on function public.anniversary_calendar(integer,integer) from public,anon;
grant execute on function public.anniversary_calendar(integer,integer) to authenticated;
