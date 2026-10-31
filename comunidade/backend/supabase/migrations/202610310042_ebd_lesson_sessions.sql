create table public.ebd_lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.ebd_classes(id) on delete cascade,
  lesson_date date not null,
  teacher_id uuid not null references public.persons(id),
  topic text not null default '' check(length(topic)<=200),
  updated_at timestamptz not null default now(),
  unique(class_id,lesson_date)
);

create index ebd_lesson_sessions_class_date on public.ebd_lesson_sessions(class_id,lesson_date);
alter table public.ebd_lesson_sessions enable row level security;
create policy ebd_lesson_sessions_read on public.ebd_lesson_sessions
  for select to authenticated using(private.ebd_teacher(class_id) or private.ebd_observer());
create policy ebd_lesson_sessions_manage on public.ebd_lesson_sessions
  for all to authenticated using(private.ebd_teacher(class_id)) with check(private.ebd_teacher(class_id));

revoke all on public.ebd_lesson_sessions from public,anon,authenticated;
grant select,insert,update on public.ebd_lesson_sessions to authenticated;
notify pgrst, 'reload schema';
