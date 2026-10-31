-- Evaluate actor scopes once per query, preserving the existing row visibility.
create function private.ebd_access_people() returns table(person_id uuid)
language sql stable security definer set search_path='' as $$
 select private.person_id() where private.person_id() is not null
 union select g.student_id from public.ebd_guardians g where g.guardian_id=private.person_id()
$$;
create function private.ebd_teaching_classes() returns table(class_id uuid)
language sql stable security definer set search_path='' as $$
 select m.class_id from public.ebd_class_members m where m.person_id=private.person_id() and m.role='teacher'
$$;
revoke all on function private.ebd_access_people(),private.ebd_teaching_classes() from public,anon;
grant execute on function private.ebd_access_people(),private.ebd_teaching_classes() to authenticated;
create index ebd_history_class_date on public.ebd_legacy_history(class_id,created_at,id);
create index ebd_history_person_class on public.ebd_legacy_history(person_id,class_id);
create index ebd_activities_position on public.ebd_activities(position,id);
alter policy ebd_history_read on public.ebd_legacy_history using(
 (select private.ebd_observer())
 or person_id in(select s.person_id from private.ebd_access_people() s)
 or class_id in(select t.class_id from private.ebd_teaching_classes() t)
);
create or replace function private.ebd_class_access(c uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.person_id();
begin
 if private.ebd_observer() or private.ebd_teacher(c) then return true; end if;
 if actor is null then return false; end if;
 return exists(select 1 from public.ebd_class_members m where m.class_id=c and
   (m.person_id=actor or m.person_id in(select g.student_id from public.ebd_guardians g where g.guardian_id=actor)))
 or exists(select 1 from public.ebd_legacy_history h where h.class_id=c and
   (h.person_id=actor or h.person_id in(select g.student_id from public.ebd_guardians g where g.guardian_id=actor)));
end $$;
create or replace function public.ebd_directory(target_class uuid)
returns table(person_id uuid,full_name text,role text,module_id uuid,next_module_id uuid,reading_group_size integer)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.person_id(); broad boolean:=private.ebd_observer() or private.ebd_teacher(target_class);
begin
 if not private.ebd_class_access(target_class) then raise exception 'forbidden' using errcode='42501'; end if;
 return query
 select m.person_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),m.role,m.module_id,m.next_module_id,m.reading_group_size
 from public.ebd_class_members m join public.persons p on p.id=m.person_id
 where m.class_id=target_class and (broad or m.person_id=actor or m.person_id in(select g.student_id from public.ebd_guardians g where g.guardian_id=actor))
 union all
 select distinct h.person_id,coalesce(nullif(p.full_name,''),'Pessoa sem nome'),'historical'::text,null::uuid,null::uuid,1
 from public.ebd_legacy_history h join public.persons p on p.id=h.person_id
 where h.class_id=target_class and (broad or h.person_id=actor or h.person_id in(select g.student_id from public.ebd_guardians g where g.guardian_id=actor))
 and not exists(select 1 from public.ebd_class_members m where m.class_id=target_class and m.person_id=h.person_id);
end $$;
