create function public.my_ebd_profiles()
returns table(view_role text,class_id uuid)
language sql stable security definer set search_path='' as $$
 select 'management'::text,null::uuid where private.module_manager('ebd') or private.ebd_observer()
 union
 select 'teacher'::text,m.class_id from public.ebd_class_members m where m.person_id=private.person_id() and m.role='teacher'
 union
 select 'student'::text,m.class_id from public.ebd_class_members m where m.person_id=private.person_id() and m.role='student'
 union
 select 'student'::text,h.class_id from public.ebd_legacy_history h where h.person_id=private.person_id()
 union
 select 'guardian'::text,m.class_id from public.ebd_guardians g join public.ebd_class_members m on m.person_id=g.student_id where g.guardian_id=private.person_id()
 union
 select 'guardian'::text,h.class_id from public.ebd_guardians g join public.ebd_legacy_history h on h.person_id=g.student_id where g.guardian_id=private.person_id()
$$;
revoke all on function public.my_ebd_profiles() from public,anon;
grant execute on function public.my_ebd_profiles() to authenticated;
