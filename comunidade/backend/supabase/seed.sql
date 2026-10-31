-- Synthetic non-login fixtures only. No real people, auth accounts or passwords.
insert into public.persons(id,full_name) values
('10000000-0000-4000-8000-000000000001','João Oliveira (exemplo)'),
('10000000-0000-4000-8000-000000000002','Davi Oliveira (exemplo)'),
('10000000-0000-4000-8000-000000000003','Marta Alves (exemplo)') on conflict do nothing;
insert into public.families(id,name) values('20000000-0000-4000-8000-000000000001','Família Oliveira (exemplo)') on conflict do nothing;
insert into public.family_members(family_id,person_id,verified) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true) on conflict do nothing;
