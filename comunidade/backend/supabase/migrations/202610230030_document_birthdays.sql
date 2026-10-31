-- A church-provided birthday directory stores day/month only, never a fictitious birth year.
create table public.document_birthdays (
 id uuid primary key,
 display_name text not null check(length(trim(display_name)) between 1 and 240),
 birth_day integer not null,
 birth_month integer not null check(birth_month between 1 and 12),
 person_id uuid references public.persons(id),
 visible boolean not null default true,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_name text not null,
 source_rows jsonb not null check(jsonb_typeof(source_rows)='array'),
 created_at timestamptz not null default now(),
 check(birth_day between 1 and extract(day from (make_date(2000,birth_month,1)+interval '1 month - 1 day'))::integer)
);
create unique index document_birthdays_person on public.document_birthdays(person_id) where person_id is not null;
alter table public.document_birthdays enable row level security;
revoke all on public.document_birthdays from anon,authenticated;
grant select on public.document_birthdays to authenticated;
create policy document_birthdays_managers on public.document_birthdays for select to authenticated using(private.manage_people());

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
  where d.visible and d.birth_month=month_number and (d.person_id is null or p.merged_into is null)
   and not exists(select 1 from public.person_contacts c where c.person_id=d.person_id and c.share_birthday and c.birth_date is not null)
 ) select e.id,e.full_name,e.day,e.month from entries e
 order by (e.month=extract(month from now() at time zone 'America/Sao_Paulo') and e.day=extract(day from now() at time zone 'America/Sao_Paulo')) desc,e.day,e.full_name,e.id
 limit 100 offset page_number*100;
end $$;
-- A later explicit profile preference also controls a linked directory entry.
create function private.sync_document_birthday_preference() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.document_birthdays set visible=new.share_birthday where person_id=new.person_id;
 return new;
end $$;
revoke all on function private.sync_document_birthday_preference() from public,anon,authenticated;
create trigger document_birthday_preference after insert or update of share_birthday on public.person_contacts
for each row execute function private.sync_document_birthday_preference();
comment on table public.document_birthdays is 'Church directory supplied for inclusion by management. Source rows retained privately; RPC exposes only names and day/month. Linked personal sharing choices take precedence when changed.';
