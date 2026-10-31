-- Preserve membership values. Record whether somebody actually reviewed them.
alter table public.persons add column membership_reviewed_at timestamptz;
update public.persons p set membership_reviewed_at=x.reviewed_at from (
 select resource_id,max(created_at) as reviewed_at from public.audit_log where action='person.status_changed' group by resource_id
) x where p.id=x.resource_id;
update public.persons set membership_reviewed_at=created_at where membership_status<>'visitor' and membership_reviewed_at is null;
create or replace function public.set_membership(person uuid,status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.manage_people() then raise exception 'forbidden' using errcode='42501';end if;
 if status is null or status not in('visitor','member','leader') then raise exception 'invalid_status';end if;
 update public.persons set membership_status=status,membership_reviewed_at=now() where id=person and merged_into is null;
 if not found then raise exception 'not_found';end if;
 insert into public.audit_log(actor_id,action,resource_id) values(private.person_id(),'person.status_changed',person);
end $$;
create function public.management_people(search_text text default '',status_filter text default 'all',page_number integer default 0,unit_filter uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.manage_people() then raise exception 'forbidden' using errcode='42501';end if;
 if search_text is null or length(search_text)>160 or status_filter is null or status_filter not in('all','unreviewed','visitor','member','leader') or page_number is null or page_number<0 or page_number>100000 then raise exception 'invalid_query';end if;
 with matching as materialized (
  select p.id,p.full_name,p.membership_status,p.membership_reviewed_at from public.persons p
  where p.merged_into is null
   and (trim(search_text)='' or position(private.identity_name(search_text) in private.identity_name(p.full_name))>0)
   and (status_filter='all' or (status_filter='unreviewed' and p.membership_reviewed_at is null) or (p.membership_status=status_filter and p.membership_reviewed_at is not null))
   and (unit_filter is null or exists(select 1 from public.community_members m where m.person_id=p.id and m.unit_id=unit_filter and m.status='active'))
 ), page as (select * from matching order by full_name,id limit 25 offset page_number*25)
 select jsonb_build_object('total',(select count(*) from matching),'items',coalesce((select jsonb_agg(to_jsonb(page) order by full_name,id) from page),'[]')) into result;
 return result;
end $$;
revoke all on function public.management_people(text,text,integer,uuid) from public,anon;
grant execute on function public.management_people(text,text,integer,uuid) to authenticated;
