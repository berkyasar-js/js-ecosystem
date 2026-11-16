-- JS Ecosystem · 0019 Bildirimler: e-posta günlüğü, bildirim indeksleri, bildirim kuralı varsayılanları, realtime yayını
-- notifications.data: {employee_id, kind, title, body, read, href, dedupe_key, email_state} — şema değişmez (COLLECTIONS biçimi).
-- İdempotent (tekrar çalıştırılabilir). 0018 gerektirir.

/* ───────── A) email_log: her gönderim / atlama / hata (servis rolü yazar; owner / org_admin okur) ───────── */
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,                                   -- instant:<tür> | digest_daily | digest_weekly | test
  to_email text not null default '',
  subject text not null default '',
  status text not null check (status in ('sent','skipped','error')),
  provider_id text,                                     -- sağlayıcı mesaj kimliği (Resend id)
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_org_idx on public.email_log (org_id, created_at desc);
create index if not exists email_log_user_kind_idx on public.email_log (user_id, kind, created_at desc);
alter table public.email_log enable row level security;
drop policy if exists email_log_r on public.email_log;
create policy email_log_r on public.email_log for select using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
revoke insert, update, delete on public.email_log from authenticated, anon;
grant select on public.email_log to authenticated;
grant select, insert, update, delete on public.email_log to service_role;

/* ───────── B) notifications indeksleri: kişi başına zaman sırası + tekilleştirme anahtarı ───────── */
create index if not exists notifications_employee_created_idx on public.notifications (org_id, (data->>'employee_id'), created_at desc);
create index if not exists notifications_dedupe_idx on public.notifications (org_id, (data->>'dedupe_key'), created_at desc) where (data->>'dedupe_key') is not null;
create index if not exists notifications_email_pending_idx on public.notifications (org_id, created_at) where (data->>'email_state') is null;

/* ───────── C) RLS: mevcut politika korunur (iç roller org bildirimlerini okur; realtime süzgeci org_id üzerinden, kişi süzgeci istemcide).
   Okundu güncellemesini yalnızca satırın sahibi ya da yönetim rolleri yapabilsin (0005 politikasına ek daraltma). ───────── */
drop policy if exists notifications_u on public.notifications;
create policy notifications_u on public.notifications for update
  using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','payroll','freelancer']::core.app_role[])
         and ((data->>'employee_id') is not distinct from core.me()::text or core.has_role(org_id, array['owner','org_admin']::core.app_role[])))
  with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','payroll','freelancer']::core.app_role[]));

/* ───────── D) notification_rules: tekillik + eski olay adları → bildirim türleri + varsayılanlar ───────── */
update public.notification_rules set event_type = case event_type
  when 'approval.created' then 'approval_requested'
  when 'approval.decided' then 'approval_decided'
  when 'task.overdue' then 'task_overdue'
  when 'task.updated' then 'comment'
  else event_type end
where event_type in ('approval.created','approval.decided','task.overdue','task.updated');
-- Yinelenenleri (aynı org + tür + kanal) temizle, sonra tekil indeks.
delete from public.notification_rules a using public.notification_rules b
  where a.org_id = b.org_id and a.event_type = b.event_type and a.channel = b.channel and a.ctid > b.ctid;
create unique index if not exists notification_rules_unique_idx on public.notification_rules (org_id, event_type, channel);
-- Varsayılanlar (yalnızca açık kararlar; kural olmayan tür herkese açık) — her organizasyon için, varsa dokunma.
insert into public.notification_rules (org_id, event_type, channel, roles, enabled)
select o.id, d.event_type, d.channel, '{}'::core.app_role[], d.enabled
from public.organizations o
cross join (values
  ('approval_requested','in_app',true), ('approval_requested','email',true), ('approval_decided','email',true),
  ('task_overdue','in_app',true), ('task_overdue','email',true), ('mention','email',true), ('task_assigned','email',true),
  ('comment','email',false), ('system','email',false), ('trello_change','email',false)
) as d(event_type, channel, enabled)
on conflict (org_id, event_type, channel) do nothing;
-- Yeni organizasyonlar için aynı varsayılanlar (tetikleyici).
create or replace function core.seed_notification_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_rules (org_id, event_type, channel, roles, enabled)
  values (new.id,'approval_requested','in_app','{}',true), (new.id,'approval_requested','email','{}',true), (new.id,'approval_decided','email','{}',true),
         (new.id,'task_overdue','in_app','{}',true), (new.id,'task_overdue','email','{}',true), (new.id,'mention','email','{}',true), (new.id,'task_assigned','email','{}',true),
         (new.id,'comment','email','{}',false), (new.id,'system','email','{}',false), (new.id,'trello_change','email','{}',false)
  on conflict (org_id, event_type, channel) do nothing;
  return new;
end $$;
drop trigger if exists organizations_seed_notification_rules on public.organizations;
create trigger organizations_seed_notification_rules after insert on public.organizations for each row execute function core.seed_notification_rules();

/* ───────── E) Realtime yayını (0016 ekledi; yoksa ekle) ───────── */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
-- Realtime satır yükü: data jsonb tam gelsin (replica identity full gerekmez; INSERT'te tüm sütunlar yayınlanır).
