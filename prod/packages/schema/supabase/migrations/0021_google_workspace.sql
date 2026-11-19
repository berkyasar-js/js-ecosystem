-- JS Ecosystem · 0021 Google Workspace (Gmail + Takvim)
-- A) user_integrations: kişisel Google bağlantısı (şifreli token; yalnızca sahibi okur, servis rolü yazar)
-- B) mail_threads / mail_messages: Gmail → CRM gelen kutusu (org posta kutusu; iç roller okur, CRM rolleri konuyu müşteriye bağlar)
-- C) integrations(provider='google') satırı her org'a (status 'available'); senkron günlüğü sağlayıcı 'google'
-- İdempotent. 0008 (integration_sync_log), 0019 (email_log), 0020 (client_contacts), 0017 (requests) gerektirir.

/* ───────── A) user_integrations ───────── */
create table if not exists public.user_integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                                  -- 'google'
  org_id uuid references public.organizations(id) on delete set null,
  config jsonb not null default '{}'::jsonb,               -- {tokens_enc: 'enc:v1:…', calendar_id} — token'lar AES-GCM şifreli (INTEGRATIONS_ENC_KEY)
  scopes text[] not null default '{}',
  email text,                                              -- bağlanan Google hesabı
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_integrations enable row level security;
drop policy if exists user_integrations_own_r on public.user_integrations;
create policy user_integrations_own_r on public.user_integrations for select using (user_id = auth.uid());
-- Yazma yalnızca servis rolü (OAuth geri çağrısı sunucuda): authenticated'a insert/update/delete yok.
revoke insert, update, delete on public.user_integrations from authenticated, anon;
grant select on public.user_integrations to authenticated;
grant select, insert, update, delete on public.user_integrations to service_role;

/* ───────── B) mail_threads ───────── */
create table if not exists public.mail_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  gmail_thread_id text not null,
  subject text not null default '',
  snippet text not null default '',
  from_email text not null default '',                     -- ilk gelen iletinin göndereni (karşı taraf)
  from_name text not null default '',
  to_emails text[] not null default '{}',                  -- konudaki tüm adresler (eşleme için)
  client_id uuid references public.clients(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  contact_id uuid references public.client_contacts(id) on delete set null,
  request_id uuid references public.requests(id) on delete set null,        -- "Göreve dönüştür" → talep (0017 requests)
  first_message_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count int not null default 0,
  unread boolean not null default false,
  archived boolean not null default false,
  labels text[] not null default '{}',                     -- Gmail etiket id'leri (INBOX, UNREAD, …) + 'JS/İşlendi'
  raw_headers jsonb not null default '{}'::jsonb,          -- ilk iletinin seçili başlıkları
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, gmail_thread_id)
);
create index if not exists mail_threads_org_last_idx on public.mail_threads (org_id, archived, last_message_at desc);
create index if not exists mail_threads_client_idx on public.mail_threads (org_id, client_id) where client_id is not null;
create index if not exists mail_threads_unread_idx on public.mail_threads (org_id) where unread and not archived;
create index if not exists mail_threads_from_idx on public.mail_threads (org_id, lower(from_email));
alter table public.mail_threads enable row level security;
-- Okuma: iç roller (müşteri rolleri hiç görmez — ajans posta kutusu).
drop policy if exists mail_threads_r on public.mail_threads;
create policy mail_threads_r on public.mail_threads for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
-- Güncelleme (müşteriye bağla / okundu / arşiv işareti): CRM rolleri. Ekleme/silme yalnızca servis rolü (eşitleme).
drop policy if exists mail_threads_u on public.mail_threads;
create policy mail_threads_u on public.mail_threads for update
  using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
revoke insert, delete on public.mail_threads from authenticated, anon;
grant select, update on public.mail_threads to authenticated;
grant select, insert, update, delete on public.mail_threads to service_role;

/* ───────── B) mail_messages ───────── */
create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.mail_threads(id) on delete cascade,
  gmail_message_id text not null unique,
  from_email text not null default '',
  from_name text not null default '',
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  date timestamptz not null default now(),
  text text not null default '',
  html_sanitized text not null default '',                 -- izin listeli etiketler; script/style/form/on* yok (sunucuda temizlenir)
  attachments jsonb not null default '[]'::jsonb,          -- [{filename, mime, size, attachment_id}] (içerik indirilmez)
  message_id_header text,
  in_reply_to text,
  references_header text,
  outbound boolean not null default false,                 -- posta kutusundan gönderilen (JS yanıtı dahil)
  created_at timestamptz not null default now()
);
create index if not exists mail_messages_thread_idx on public.mail_messages (thread_id, date);
create index if not exists mail_messages_org_idx on public.mail_messages (org_id, date desc);
alter table public.mail_messages enable row level security;
drop policy if exists mail_messages_r on public.mail_messages;
create policy mail_messages_r on public.mail_messages for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
revoke insert, update, delete on public.mail_messages from authenticated, anon;
grant select on public.mail_messages to authenticated;
grant select, insert, update, delete on public.mail_messages to service_role;

-- Realtime: konu listesi canlı güncellensin (yeni ileti / okundu / eşleşme).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mail_threads') then
      alter publication supabase_realtime add table public.mail_threads;
    end if;
  end if;
end $$;

/* ───────── C) integrations: her org'a 'google' satırı (panel kartı durumu) ───────── */
insert into public.integrations (org_id, provider, name, status, scopes)
select o.id, 'google', 'Google Workspace', 'available', '{}'
from public.organizations o
where not exists (select 1 from public.integrations i where i.org_id = o.id and i.provider = 'google');

-- Yeni org açılınca da satır gelsin (0016/0019 varsayılan tetikleyici deseni).
create or replace function core.google_integration_default() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.integrations (org_id, provider, name, status, scopes) values (new.id, 'google', 'Google Workspace', 'available', '{}')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists organizations_google_default on public.organizations;
create trigger organizations_google_default after insert on public.organizations for each row execute function core.google_integration_default();

-- Not: `integrations` satırının `config` sütunu (0007) org posta kutusunun GoogleOrgConfig'ini tutar; `tokens_enc` AES-GCM şifrelidir ve
-- yalnızca servis rolü okur (0007/0014 politikaları: config istemciye maskelenerek döner, bkz. apps/admin google route).
-- email_log.kind yeni değerler: 'reply' (Gelen kutusu yanıtı). integration_sync_log.provider = 'google', entity = 'mail'.
