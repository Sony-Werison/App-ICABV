-- Date-only group schedules imported from the church's original documents.
create table if not exists public.duty_rosters (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(title) between 1 and 100),
 source_name text not null,
 source_sha256 text not null unique check(source_sha256 ~ '^[a-f0-9]{64}$'),
 groups jsonb not null check(jsonb_typeof(groups)='array'),
 dates jsonb not null check(jsonb_typeof(dates)='array'),
 created_at timestamptz not null default now()
);
alter table public.duty_rosters enable row level security;
revoke all on public.duty_rosters from anon,authenticated;
grant select on public.duty_rosters to authenticated;
create policy duty_rosters_read on public.duty_rosters for select to authenticated using(private.person_id() is not null);
comment on table public.duty_rosters is 'Original group rosters and date-only duties. Names are preserved; person_id is set only for confirmed identities. No inferred times or recurring dates.';
