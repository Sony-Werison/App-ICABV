-- Unified domain modules. No legacy passwords, public profile lists or destructive resets.
create table public.module_access (
 person_id uuid references public.persons(id), module text check(module in ('louvor','ebd')),
 role text check(role in ('manager','observer')), primary key(person_id,module)
);
create function private.module_manager(m text) returns boolean language sql stable security definer set search_path='' as $$
 select private.manage_people() or exists(select 1 from public.module_access where person_id=private.person_id() and module=m and role='manager')
$$;
create table public.person_contacts (
 person_id uuid primary key references public.persons(id), phone text not null default '' check(length(phone)<=40),
 email text not null default '' check(length(email)<=254), birth_date date, avatar_url text not null default '' check(avatar_url='' or avatar_url~'^https://')
);
create table public.worship_members (
 person_id uuid primary key references public.persons(id), roles text[] not null default '{}', active boolean not null default true,
 check(cardinality(roles)<=20)
);
create table public.worship_songs (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 180),
 artist text not null default '', musical_key text not null default 'C', category text not null default 'Louvor' check(category in ('Hino','Louvor','Infantil')),
 is_new boolean not null default false, youtube_url text not null default '' check(youtube_url='' or youtube_url~'^https://(www\.)?(youtube\.com/|youtu\.be/)'),
 lyrics text not null default '' check(length(lyrics)<=60000), chords text not null default '' check(length(chords)<=60000),
 bpm integer not null default 80 check(bpm between 20 and 300), pdf_links jsonb not null default '[]' check(jsonb_typeof(pdf_links)='array' and jsonb_array_length(pdf_links)<=20),
 archived boolean not null default false, created_at timestamptz not null default now()
);
create table public.worship_services (
 id uuid primary key default gen_random_uuid(), title text not null check(length(trim(title)) between 1 and 180),
 starts_at timestamptz not null, period text not null default 'noite' check(period in ('manhã','noite','ensaio','outro')),
 assignments jsonb not null default '{}' check(jsonb_typeof(assignments)='object'), playlist uuid[] not null default '{}' check(cardinality(playlist)<=100),
 featured boolean not null default false, status text not null default 'planned' check(status in ('planned','completed','canceled')),
 created_at timestamptz not null default now()
);
create table public.worship_rehearsals (
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.persons(id) default private.person_id(),
 title text not null check(length(trim(title)) between 1 and 180), playlist uuid[] not null default '{}' check(cardinality(playlist)<=100), created_at timestamptz not null default now()
);
create table public.worship_live (
 service_id uuid primary key references public.worship_services(id) on delete cascade, song_id uuid references public.worship_songs(id),
 transpose integer not null default 0 check(transpose between -12 and 12), scrolling boolean not null default false,
 scroll_speed integer not null default 30 check(scroll_speed between 1 and 100), metronome boolean not null default false,
 bpm integer not null default 80 check(bpm between 20 and 300), updated_at timestamptz not null default now(), updated_by uuid references public.persons(id)
);
create table public.ebd_classes (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 kind text not null default 'youth' check(kind in ('youth','standard','teen')), criteria text[] not null default array['Presença','Bíblia','Oferta','Atividade'],
 start_date date not null default current_date, include_saturday boolean not null default false,
 report_style text not null default 'marking' check(report_style in ('marking','grades')), archived boolean not null default false,
 whatsapp_template text not null default 'Olá {{nome}}! Continue seus estudos na EBD da classe {{classe}}. Sua última atividade foi em {{ultimaAtividade}}.',
 created_at timestamptz not null default now(), check(cardinality(criteria) between 1 and 20)
);
create table public.ebd_class_members (
 class_id uuid references public.ebd_classes(id), person_id uuid references public.persons(id),
 role text not null check(role in ('student','teacher')), module_id uuid, next_module_id uuid,
 reading_group_size integer not null default 1 check(reading_group_size between 1 and 100), primary key(class_id,person_id)
);
create index ebd_class_members_person on public.ebd_class_members(person_id);
create table public.ebd_guardians (
 student_id uuid references public.persons(id), guardian_id uuid references public.persons(id),
 primary key(student_id,guardian_id), check(student_id<>guardian_id)
);
create function private.ebd_teacher(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.module_manager('ebd') or exists(select 1 from public.ebd_class_members where class_id=c and person_id=private.person_id() and role='teacher')
$$;
create function private.ebd_observer() returns boolean language sql stable security definer set search_path='' as $$
 select private.module_manager('ebd') or private.has_role(array['elder']) or exists(select 1 from public.module_access where person_id=private.person_id() and module='ebd' and role='observer')
$$;
create function private.ebd_student_access(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p=private.person_id() or exists(select 1 from public.ebd_guardians where student_id=p and guardian_id=private.person_id())
$$;
create function private.ebd_class_access(c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.ebd_observer() or private.ebd_teacher(c) or exists(select 1 from public.ebd_class_members where class_id=c and private.ebd_student_access(person_id))
$$;
create table public.ebd_modules (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.ebd_classes(id),
 title text not null check(length(trim(title)) between 1 and 180), description text not null default '', position integer not null default 0, archived boolean not null default false
);
alter table public.ebd_class_members add foreign key(module_id) references public.ebd_modules(id);
alter table public.ebd_class_members add foreign key(next_module_id) references public.ebd_modules(id);
create table public.ebd_activities (
 id uuid primary key default gen_random_uuid(), module_id uuid not null references public.ebd_modules(id),
 title text not null check(length(trim(title)) between 1 and 180), kind text not null check(kind in ('bible','video','quiz','video_bible','manual')),
 body text not null default '' check(length(body)<=60000), passages text not null default '', video_url text not null default '' check(video_url='' or video_url~'^https://'),
 questions jsonb not null default '[]' check(jsonb_typeof(questions)='array' and jsonb_array_length(questions)<=50),
 available_on date not null default current_date, due_on date, published boolean not null default false,
 minimum_seconds integer not null default 0 check(minimum_seconds between 0 and 7200), created_at timestamptz not null default now(), check(due_on is null or due_on>=available_on)
);
create table public.ebd_activity_keys (
 activity_id uuid primary key references public.ebd_activities(id) on delete cascade, answers jsonb not null default '{}'
);
create table public.ebd_submissions (
 id uuid primary key default gen_random_uuid(), activity_id uuid not null references public.ebd_activities(id), person_id uuid not null references public.persons(id),
 answers jsonb not null, status text not null default 'pending' check(status in ('pending','graded')), score numeric check(score between 0 and 10),
 teacher_comment text not null default '' check(length(teacher_comment)<=6000), teacher_id uuid references public.persons(id),
 student_reply text not null default '' check(length(student_reply)<=6000), created_at timestamptz not null default now(), graded_at timestamptz,
 unique(activity_id,person_id), check(jsonb_typeof(answers)='object')
);
create table public.ebd_attendance (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.ebd_classes(id), person_id uuid not null references public.persons(id),
 lesson_date date not null, present boolean not null default false, criteria jsonb not null default '{}' check(jsonb_typeof(criteria)='object'),
 score numeric check(score between 0 and 10), note text not null default '' check(length(note)<=2000), unique(class_id,person_id,lesson_date)
);
create table public.ebd_recordings (
 id uuid primary key default gen_random_uuid(), class_id uuid not null references public.ebd_classes(id), title text not null check(length(trim(title)) between 1 and 180),
 lesson_date date not null, teacher text not null default '', url text not null check(url~'^https://'), published boolean not null default false
);
create function private.ebd_activity_class(a uuid) returns uuid language sql stable security definer set search_path='' as $$
 select m.class_id from public.ebd_activities x join public.ebd_modules m on m.id=x.module_id where x.id=a
$$;
create function public.module_capabilities() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('louvor_manager',private.module_manager('louvor'),'ebd_manager',private.module_manager('ebd'),'ebd_observer',private.ebd_observer(),'ebd_teacher',exists(select 1 from public.ebd_class_members where person_id=private.person_id() and role='teacher'))
$$;
create function public.module_people(target_module text) returns table(id uuid,full_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if private.person_id() is null or not private.module_manager(target_module) then raise exception 'forbidden' using errcode='42501';end if;
 return query select p.id,coalesce(nullif(p.full_name,''),case when p.id=private.person_id() then 'Minha conta' else 'Pessoa sem nome · '||left(p.id::text,8) end) from public.persons p order by p.full_name,p.id;
end $$;
create function public.worship_directory() returns table(person_id uuid,full_name text,roles text[],active boolean) language plpgsql stable security definer set search_path='' as $$
begin
 perform private.core_actor();
 return query select w.person_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),w.roles,w.active from public.worship_members w join public.persons p on p.id=w.person_id where w.active or private.module_manager('louvor') order by p.full_name,p.id;
end $$;
create function public.ebd_directory(target_class uuid) returns table(person_id uuid,full_name text,role text,module_id uuid,next_module_id uuid,reading_group_size integer) language plpgsql stable security definer set search_path='' as $$
begin
 if not private.ebd_class_access(target_class) then raise exception 'forbidden' using errcode='42501';end if;
 return query select m.person_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),m.role,m.module_id,m.next_module_id,m.reading_group_size from public.ebd_class_members m join public.persons p on p.id=m.person_id
 where m.class_id=target_class and (private.ebd_observer() or private.ebd_teacher(target_class) or private.ebd_student_access(m.person_id)) order by p.full_name,p.id;
end $$;
-- Enforce cross-references even for direct REST writes.
create function private.validate_worship_service() returns trigger language plpgsql security definer set search_path='' as $$
declare v text; ids jsonb;
begin
 if exists(select 1 from unnest(new.playlist) i where not exists(select 1 from public.worship_songs s where s.id=i)) then raise exception 'invalid_playlist';end if;
 for v,ids in select * from jsonb_each(new.assignments) loop
  if length(v)>80 or jsonb_typeof(ids)<>'array' or jsonb_array_length(ids)>50 then raise exception 'invalid_assignments';end if;
  if exists(select 1 from jsonb_array_elements_text(ids) i where not exists(select 1 from public.worship_members m where m.person_id::text=i and m.active)) then raise exception 'invalid_member';end if;
 end loop;
 return new;
end $$;
create trigger worship_service_validation before insert or update on public.worship_services for each row execute function private.validate_worship_service();
create function private.validate_ebd_enrollment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.module_id is not null and not exists(select 1 from public.ebd_modules where id=new.module_id and class_id=new.class_id) then raise exception 'module_class_mismatch';end if;
 if new.next_module_id is not null and not exists(select 1 from public.ebd_modules where id=new.next_module_id and class_id=new.class_id) then raise exception 'module_class_mismatch';end if;
 return new;
end $$;
create trigger ebd_enrollment_validation before insert or update on public.ebd_class_members for each row execute function private.validate_ebd_enrollment();
create function public.set_worship_live(target_service uuid, state jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.worship_services; actor uuid:=private.core_actor(); selected uuid:=nullif(state->>'song_id','')::uuid;
begin
 select * into s from public.worship_services where id=target_service for update;
 if s.id is null then raise exception 'not_found';end if;
 if not private.module_manager('louvor') and not exists(select 1 from jsonb_each(s.assignments) x, jsonb_array_elements_text(x.value) p where lower(x.key) like '%abertura%' and p.value=actor::text) then raise exception 'forbidden' using errcode='42501';end if;
 if selected is not null and not selected=any(s.playlist) then raise exception 'song_not_in_playlist';end if;
 if s.status='canceled' then raise exception 'service_closed';end if;
 insert into public.worship_live(service_id,song_id,transpose,scrolling,scroll_speed,metronome,bpm,updated_by)
 values(target_service,selected,coalesce((state->>'transpose')::int,0),coalesce((state->>'scrolling')::boolean,false),coalesce((state->>'scroll_speed')::int,30),coalesce((state->>'metronome')::boolean,false),coalesce((state->>'bpm')::int,80),actor)
 on conflict(service_id) do update set song_id=excluded.song_id,transpose=excluded.transpose,scrolling=excluded.scrolling,scroll_speed=excluded.scroll_speed,metronome=excluded.metronome,bpm=excluded.bpm,updated_by=actor,updated_at=now();
end $$;
create function public.save_worship_playlist(target_service uuid, songs uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare s public.worship_services; actor uuid:=private.core_actor();
begin
 select * into s from public.worship_services where id=target_service for update;
 if s.id is null or s.status<>'planned' then raise exception 'service_closed';end if;
 if not private.module_manager('louvor') and not exists(select 1 from jsonb_each(s.assignments) x, jsonb_array_elements_text(x.value) p where lower(x.key) like '%abertura%' and p.value=actor::text) then raise exception 'forbidden' using errcode='42501';end if;
 update public.worship_services set playlist=songs where id=target_service;
end $$;
create function public.save_ebd_activity(resource uuid,data jsonb,answer_key jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; m public.ebd_modules; q jsonb; idx integer:=0;
begin
 select * into m from public.ebd_modules where id=(data->>'module_id')::uuid;
 if m.id is null or not private.ebd_teacher(m.class_id) then raise exception 'forbidden' using errcode='42501';end if;
 if resource is not null and not private.ebd_teacher(private.ebd_activity_class(resource)) then raise exception 'forbidden' using errcode='42501';end if;
 if jsonb_typeof(answer_key)<>'object' or jsonb_typeof(data->'questions')<>'array' then raise exception 'invalid_questions';end if;
 for q in select * from jsonb_array_elements(data->'questions') loop
  if jsonb_typeof(q)<>'object' or length(coalesce(q->>'prompt','')) not between 1 and 2000 or coalesce(q->>'type','text') not in ('text','choice') then raise exception 'invalid_questions';end if;
  if q->>'type'='choice' then
   if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'invalid_options';end if;
   if jsonb_array_length(q->'options') not between 2 and 10 or not (answer_key ? idx::text) or (answer_key->>idx::text)::int not between 0 and jsonb_array_length(q->'options')-1 then raise exception 'invalid_options';end if;
  end if;
  idx:=idx+1;
 end loop;
 insert into public.ebd_activities(id,module_id,title,kind,body,passages,video_url,questions,available_on,due_on,published,minimum_seconds)
 values(coalesce(resource,gen_random_uuid()),m.id,data->>'title',data->>'kind',coalesce(data->>'body',''),coalesce(data->>'passages',''),coalesce(data->>'video_url',''),data->'questions',coalesce(nullif(data->>'available_on','')::date,current_date),nullif(data->>'due_on','')::date,coalesce((data->>'published')::boolean,false),coalesce((data->>'minimum_seconds')::int,0))
 on conflict(id) do update set module_id=excluded.module_id,title=excluded.title,kind=excluded.kind,body=excluded.body,passages=excluded.passages,video_url=excluded.video_url,questions=excluded.questions,available_on=excluded.available_on,due_on=excluded.due_on,published=excluded.published,minimum_seconds=excluded.minimum_seconds returning id into result;
 insert into public.ebd_activity_keys(activity_id,answers) values(result,answer_key) on conflict(activity_id) do update set answers=excluded.answers;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'ebd.activity_saved',result);
 return result;
end $$;
create table public.ebd_activity_starts (
 activity_id uuid references public.ebd_activities(id) on delete cascade, person_id uuid references public.persons(id), started_at timestamptz not null default now(), primary key(activity_id,person_id)
);
create function public.start_ebd_activity(activity uuid) returns timestamptz language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor(); result timestamptz; a public.ebd_activities;
begin
 select * into a from public.ebd_activities where id=activity and published and available_on<=current_date and (due_on is null or due_on>=current_date);
 if a.id is null or not exists(select 1 from public.ebd_class_members where class_id=private.ebd_activity_class(activity) and person_id=actor and role='student') then raise exception 'activity_unavailable' using errcode='42501';end if;
 insert into public.ebd_activity_starts(activity_id,person_id) values(activity,actor) on conflict do nothing;
 select started_at into result from public.ebd_activity_starts where activity_id=activity and person_id=actor;return result;
end $$;
create function public.submit_ebd_activity(activity uuid,responses jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.core_actor();a public.ebd_activities;key jsonb;q jsonb; idx integer:=0; correct integer:=0; automatic boolean:=true;result uuid; started timestamptz;
begin
 perform public.start_ebd_activity(activity);
 select * into a from public.ebd_activities where id=activity;
 select started_at into started from public.ebd_activity_starts where activity_id=activity and person_id=actor;
 if now()<started+make_interval(secs=>a.minimum_seconds) then raise exception 'minimum_time_required';end if;
 if jsonb_typeof(responses) is distinct from 'object' or length(responses::text)>100000 then raise exception 'invalid_answers';end if;
 select answers into key from public.ebd_activity_keys where activity_id=activity;
 for q in select * from jsonb_array_elements(a.questions) loop
  if not (responses ? idx::text) or length(trim(coalesce(responses->>idx::text,'')))=0 then raise exception 'answer_required';end if;
  if q->>'type'='choice' then
   if (responses->>idx::text)::int not between 0 and jsonb_array_length(q->'options')-1 then raise exception 'invalid_answers';end if;
   if responses->idx::text=key->idx::text then correct:=correct+1;end if;
  else automatic:=false;end if;idx:=idx+1;
 end loop;
 if idx=0 and length(trim(coalesce(responses->>'reflection','')))=0 then raise exception 'answer_required';end if;
 insert into public.ebd_submissions(activity_id,person_id,answers,status,score,graded_at)
 values(activity,actor,responses,case when automatic and idx>0 then 'graded' else 'pending' end,case when automatic and idx>0 then round(correct*10.0/idx,2) else null end,case when automatic and idx>0 then now() else null end) returning id into result;
 insert into public.audit_log(actor_id,action,resource_id) values(actor,'ebd.activity_submitted',result);return result;
end $$;
create function public.grade_ebd_submission(submission uuid,grade numeric,comment text) returns void language plpgsql security definer set search_path='' as $$
declare s public.ebd_submissions;
begin
 select * into s from public.ebd_submissions where id=submission for update;
 if s.id is null or not private.ebd_teacher(private.ebd_activity_class(s.activity_id)) then raise exception 'forbidden' using errcode='42501';end if;
 if grade is null or grade not between 0 and 10 then raise exception 'invalid_score';end if;
 update public.ebd_submissions set score=grade,teacher_comment=coalesce(comment,''),status='graded',teacher_id=private.person_id(),graded_at=now() where id=submission;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'ebd.submission_graded',submission);
end $$;
create function public.reply_ebd_submission(submission uuid,reply text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.ebd_submissions set student_reply=reply where id=submission and person_id=private.core_actor();
 if not found then raise exception 'forbidden' using errcode='42501';end if;
end $$;
-- RLS on every domain table; no anonymous access and no shared passwords.
alter table public.module_access enable row level security;
create policy module_access_read on public.module_access for select to authenticated using(person_id=private.person_id() or private.manage_people());
create policy module_access_manage on public.module_access for all to authenticated using(private.has_role(array['admin'])) with check(private.has_role(array['admin']));
alter table public.person_contacts enable row level security;
create policy contacts_access on public.person_contacts for all to authenticated using(person_id=private.person_id() or private.manage_people()) with check(person_id=private.person_id() or private.manage_people());
alter table public.worship_members enable row level security;
create policy worship_members_read on public.worship_members for select to authenticated using(person_id=private.person_id() or private.module_manager('louvor'));
create policy worship_members_manage on public.worship_members for all to authenticated using(private.module_manager('louvor')) with check(private.module_manager('louvor'));
alter table public.worship_songs enable row level security;
create policy worship_songs_read on public.worship_songs for select to authenticated using(private.person_id() is not null);
create policy worship_songs_manage on public.worship_songs for all to authenticated using(private.module_manager('louvor')) with check(private.module_manager('louvor'));
alter table public.worship_services enable row level security;
create policy worship_services_read on public.worship_services for select to authenticated using(private.person_id() is not null);
create policy worship_services_manage on public.worship_services for all to authenticated using(private.module_manager('louvor')) with check(private.module_manager('louvor'));
alter table public.worship_live enable row level security;
create policy worship_live_read on public.worship_live for select to authenticated using(private.person_id() is not null);
alter table public.worship_rehearsals enable row level security;
create policy worship_rehearsals_own on public.worship_rehearsals for all to authenticated using(person_id=private.person_id()) with check(person_id=private.person_id());
alter table public.ebd_classes enable row level security;
create policy ebd_classes_read on public.ebd_classes for select to authenticated using(private.ebd_class_access(id));
create policy ebd_classes_manage on public.ebd_classes for all to authenticated using(private.module_manager('ebd')) with check(private.module_manager('ebd'));
alter table public.ebd_class_members enable row level security;
create policy ebd_enrollments_read on public.ebd_class_members for select to authenticated using(private.ebd_observer() or private.ebd_teacher(class_id) or private.ebd_student_access(person_id));
create policy ebd_enrollments_manage on public.ebd_class_members for all to authenticated using(private.module_manager('ebd')) with check(private.module_manager('ebd'));
alter table public.ebd_guardians enable row level security;
create policy ebd_guardians_read on public.ebd_guardians for select to authenticated using(guardian_id=private.person_id() or student_id=private.person_id() or private.module_manager('ebd'));
create policy ebd_guardians_manage on public.ebd_guardians for all to authenticated using(private.module_manager('ebd')) with check(private.module_manager('ebd'));
alter table public.ebd_modules enable row level security;
create policy ebd_modules_read on public.ebd_modules for select to authenticated using(private.ebd_class_access(class_id));
create policy ebd_modules_manage on public.ebd_modules for all to authenticated using(private.ebd_teacher(class_id)) with check(private.ebd_teacher(class_id));
alter table public.ebd_activities enable row level security;
create policy ebd_activities_read on public.ebd_activities for select to authenticated using(private.ebd_teacher(private.ebd_activity_class(id)) or (published and available_on<=current_date and private.ebd_class_access(private.ebd_activity_class(id))));
alter table public.ebd_activity_keys enable row level security;
create policy ebd_keys_teacher on public.ebd_activity_keys for select to authenticated using(private.ebd_teacher(private.ebd_activity_class(activity_id)));
alter table public.ebd_submissions enable row level security;
create policy ebd_submissions_read on public.ebd_submissions for select to authenticated using(private.ebd_student_access(person_id) or private.ebd_teacher(private.ebd_activity_class(activity_id)) or private.ebd_observer());
alter table public.ebd_activity_starts enable row level security;
create policy ebd_starts_read on public.ebd_activity_starts for select to authenticated using(person_id=private.person_id());
alter table public.ebd_attendance enable row level security;
create policy ebd_attendance_read on public.ebd_attendance for select to authenticated using(private.ebd_student_access(person_id) or private.ebd_teacher(class_id) or private.ebd_observer());
create policy ebd_attendance_manage on public.ebd_attendance for all to authenticated using(private.ebd_teacher(class_id)) with check(private.ebd_teacher(class_id) and exists(select 1 from public.ebd_class_members m where m.class_id=ebd_attendance.class_id and m.person_id=ebd_attendance.person_id and m.role='student'));
alter table public.ebd_recordings enable row level security;
create policy ebd_recordings_read on public.ebd_recordings for select to authenticated using(private.ebd_teacher(class_id) or (published and private.ebd_class_access(class_id)));
create policy ebd_recordings_manage on public.ebd_recordings for all to authenticated using(private.ebd_teacher(class_id)) with check(private.ebd_teacher(class_id));
-- Explicit table/sequence grants (Supabase defaults vary between projects).
revoke all on public.module_access,public.person_contacts,public.worship_members,public.worship_songs,public.worship_services,public.worship_rehearsals,public.worship_live,public.ebd_classes,public.ebd_class_members,public.ebd_guardians,public.ebd_modules,public.ebd_activities,public.ebd_activity_keys,public.ebd_submissions,public.ebd_attendance,public.ebd_recordings,public.ebd_activity_starts from public,anon,authenticated;
grant select,insert,update,delete on public.module_access,public.person_contacts,public.worship_members,public.worship_songs,public.worship_services,public.worship_rehearsals,public.ebd_classes,public.ebd_class_members,public.ebd_guardians,public.ebd_modules,public.ebd_attendance,public.ebd_recordings to authenticated;
grant select on public.worship_live,public.ebd_activities,public.ebd_activity_keys,public.ebd_submissions,public.ebd_activity_starts to authenticated;
revoke all on function private.module_manager(text),private.ebd_teacher(uuid),private.ebd_observer(),private.ebd_student_access(uuid),private.ebd_class_access(uuid),private.ebd_activity_class(uuid),private.validate_worship_service(),private.validate_ebd_enrollment() from public,anon,authenticated;
grant execute on function private.module_manager(text),private.ebd_teacher(uuid),private.ebd_observer(),private.ebd_student_access(uuid),private.ebd_class_access(uuid),private.ebd_activity_class(uuid) to authenticated;
revoke all on function public.module_capabilities(),public.module_people(text),public.worship_directory(),public.ebd_directory(uuid),public.set_worship_live(uuid,jsonb),public.save_worship_playlist(uuid,uuid[]),public.save_ebd_activity(uuid,jsonb,jsonb),public.start_ebd_activity(uuid),public.submit_ebd_activity(uuid,jsonb),public.grade_ebd_submission(uuid,numeric,text),public.reply_ebd_submission(uuid,text) from public,anon;
grant execute on function public.module_capabilities(),public.module_people(text),public.worship_directory(),public.ebd_directory(uuid),public.set_worship_live(uuid,jsonb),public.save_worship_playlist(uuid,uuid[]),public.save_ebd_activity(uuid,jsonb,jsonb),public.start_ebd_activity(uuid),public.submit_ebd_activity(uuid,jsonb),public.grade_ebd_submission(uuid,numeric,text),public.reply_ebd_submission(uuid,text) to authenticated;
