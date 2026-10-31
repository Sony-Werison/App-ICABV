create table public.notification_reads (
 person_id uuid not null references public.persons(id), notification_key text not null check(length(notification_key)<=220),
 version text not null check(length(version)<=100), read_at timestamptz not null default now(),
 primary key(person_id,notification_key)
);
alter table public.notification_reads enable row level security;
create policy notification_reads_own on public.notification_reads for all to authenticated
 using(person_id=(select private.person_id())) with check(person_id=(select private.person_id()));
revoke all on public.notification_reads from public,anon,authenticated;
grant select,insert,update on public.notification_reads to authenticated;

create function public.notification_feed(page_number integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.person_id(); result jsonb; ebd_manager boolean:=private.module_manager('ebd');
begin
 if actor is null then raise exception 'forbidden' using errcode='42501'; end if;
 if page_number is null or page_number<0 or page_number>100000 then raise exception 'invalid_page'; end if;
 with notices as (
  select 'announcement:'||a.id as key,md5(a.title||a.body||coalesce(a.expires_at::text,'')) as version,
   'announcement'::text kind,a.title,'Novo comunicado da igreja'::text body,'content'::text tab,null::text section,
   a.created_at as occurred_at,false actionable
  from public.announcements a where a.published and public.content_visible(a.published,a.audience) and (a.expires_at is null or a.expires_at>now()) and a.created_at>now()-interval '90 days'
  union all
  select 'event:'||e.id,md5(e.title||e.starts_at::text),'event_confirmation',e.title,
   'Confirme se você vai participar deste evento.','agenda',null,e.starts_at,true
  from public.events e where e.status='published' and public.event_visible(e.id) and e.starts_at>now() and e.starts_at<now()+interval '14 days'
   and not exists(select 1 from public.event_registrations r where r.event_id=e.id and r.person_id=actor)
  union all
  select 'event-reminder:'||e.id,md5(e.title||e.starts_at::text),'event_reminder',e.title,
   'Você está inscrito. O evento acontece nos próximos sete dias.','agenda',null,e.starts_at,false
  from public.events e join public.event_registrations r on r.event_id=e.id and r.person_id=actor and r.status='registered'
  where e.status='published' and public.event_visible(e.id) and e.starts_at>now() and e.starts_at<now()+interval '7 days'
  union all
  select 'service:'||a.id,md5(s.title||s.starts_at::text||a.status),'service',s.title,
   case when a.status='pending' then 'Sua participação nesta escala aguarda confirmação.' else 'Você está escalado nos próximos sete dias.' end,
   'schedules',null,s.starts_at,a.status='pending'
  from public.service_assignments a join public.service_shifts s on s.id=a.shift_id
  where a.person_id=actor and a.status<>'declined' and not s.canceled and s.starts_at>now()
   and s.starts_at<now()+case when a.status='pending' then interval '30 days' else interval '7 days' end
  union all
  select 'worship:'||s.id,md5(s.title||s.starts_at::text||s.playlist::text||s.assignments::text),
   case when cardinality(s.playlist)=0 and exists(select 1 from jsonb_each(s.assignments) a where lower(a.key) in ('abertura','dirigente','direção','direcao','worship_leader','dirigente de louvor') and a.value @> jsonb_build_array(actor::text)) then 'worship_playlist' else 'worship_week' end,
   s.title,
   case when cardinality(s.playlist)=0 and exists(select 1 from jsonb_each(s.assignments) a where lower(a.key) in ('abertura','dirigente','direção','direcao','worship_leader','dirigente de louvor') and a.value @> jsonb_build_array(actor::text)) then 'Você está escalado na abertura do louvor e o repertório ainda está pendente.' else 'Você participa deste culto nos próximos sete dias. Confira a escala e o repertório.' end,
   'louvor','Escalas',s.starts_at,cardinality(s.playlist)=0 and exists(select 1 from jsonb_each(s.assignments) a where lower(a.key) in ('abertura','dirigente','direção','direcao','worship_leader','dirigente de louvor') and a.value @> jsonb_build_array(actor::text))
  from public.worship_services s where s.status='planned' and s.starts_at>now() and s.starts_at<now()+interval '7 days'
   and (private.module_manager('louvor') or exists(select 1 from public.worship_members wm where wm.person_id=actor and wm.active))
   and exists(select 1 from jsonb_each(s.assignments) a where a.value @> jsonb_build_array(actor::text))
  union all
  select 'meeting:'||m.id,md5(m.title||m.starts_at::text),'group_meeting',m.title,
   'Confirme sua participação no próximo encontro do grupo.','community',null,m.starts_at,true
  from public.group_meetings m join public.community_members cm on cm.unit_id=m.unit_id and cm.person_id=actor and cm.status='active'
  where m.status='published' and m.starts_at>now() and m.starts_at<now()+interval '7 days'
   and not exists(select 1 from public.group_meeting_participants p where p.meeting_id=m.id and p.person_id=actor)
  union all
  select 'core:'||n.id,n.created_at::text,'prayer_support','Alguém está orando com você',
   'Seu pedido de oração recebeu apoio.','prayers',null,n.created_at,false
  from public.core_notifications n where n.person_id=actor and n.read_at is null
  union all
  select 'food:'||c.item_id,md5(c.quantity::text||c.received_quantity::text||f.deadline::text),'food_delivery',f.title,
   'Você ainda tem itens de cesta básica para entregar. Confira o prazo e o local.','food-drive',null,f.deadline::timestamptz,true
  from public.food_commitments c join public.food_items i on i.id=c.item_id join public.food_campaigns f on f.id=i.campaign_id
  where c.person_id=actor and c.quantity>c.received_quantity and f.status='open' and f.deadline between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+3
  union all
  select 'ebd-correction:'||pending.class_id,md5(pending.total::text||pending.latest::text),'ebd_correction','Atividades aguardando correção',
   pending.total::text||' resposta(s) da EBD precisam de avaliação.','ebd','Correções',pending.latest,true
  from (
   select h.class_id,count(*) as total,max(h.created_at) as latest from (
    select h.class_id,h.created_at from public.ebd_legacy_history h where h.status in ('pending','pending_review')
    union all select m.class_id,s.created_at from public.ebd_submissions s join public.ebd_activities a on a.id=s.activity_id join public.ebd_modules m on m.id=a.module_id where s.status='pending'
   ) h where ebd_manager or h.class_id in(select t.class_id from private.ebd_teaching_classes() t) group by h.class_id
  ) pending
 ), visible as (
  select n.*,r.read_at from notices n left join public.notification_reads r on r.person_id=actor and r.notification_key=n.key and r.version=n.version
 ), paged as (
  select * from visible order by (read_at is null) desc,actionable desc,occurred_at desc,key limit 30 offset page_number*30
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
  'unread_count',(select count(*) from visible where read_at is null),'total_count',(select count(*) from visible)) into result;
 return result;
end $$;
create function public.mark_app_notification(notification_key text,notification_version text) returns void
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=private.person_id();
begin
 if actor is null then raise exception 'forbidden' using errcode='42501'; end if;
 if notification_key is null or notification_version is null then raise exception 'invalid_data'; end if;
 insert into public.notification_reads(person_id,notification_key,version) values(actor,mark_app_notification.notification_key,notification_version)
 on conflict on constraint notification_reads_pkey do update set version=excluded.version,read_at=now();
end $$;
revoke all on function public.notification_feed(integer),public.mark_app_notification(text,text) from public,anon;
grant execute on function public.notification_feed(integer),public.mark_app_notification(text,text) to authenticated;
