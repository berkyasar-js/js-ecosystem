-- JS Ecosystem · 0020 HubSpot (CRM) geçici iki yönlü senkron
-- A) client_contacts (HubSpot contact ↔ müşteri kişisi; COLLECTIONS biçimi: gerçek kolonlar + data jsonb)
-- B) integration_links (sağlayıcı/varlık/uzak id ↔ yerel id + saatler; son-yazan-kazanır için)
-- C) clients / brands / crm_deals: source_ref + updated_at / sync_origin / synced_at (0008-0010 Trello çakışma saati ile aynı kural)
-- İdempotent (tekrar çalıştırılabilir). 0008 (integration_sync_log), 0010 gerektirir.

/* ───────── Ortak dokunma tetikleyicisi (0010 kuralı, genel) ─────────
   updated_at her yazmada tazelenir. sync_origin/synced_at'e dokunmayan yazma = JS tarafı → işaret temizlenir.
   Dış kaynaklı yazma (sync_origin dolu) → synced_at = updated_at (aynı now(); saat kayması "JS düzenlemesi" gibi görünmez). */
create or replace function core.sync_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.sync_origin is not distinct from old.sync_origin and new.synced_at is not distinct from old.synced_at then
    new.sync_origin := null;
  elsif new.sync_origin is not null then
    new.synced_at := new.updated_at;
  end if;
  return new;
end $$;

/* ───────── A) client_contacts ───────── */
create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  email text not null default '',
  phone text not null default '',
  title text not null default '',
  source_ref text,                         -- 'hubspot:contact:<id>'
  raw jsonb,                               -- HubSpot özellikleri (yalnızca servis rolü yazar)
  data jsonb not null default '{}'::jsonb, -- COLLECTIONS uyumluluğu (ek alanlar)
  synced_at timestamptz,
  sync_origin text,                        -- 'hubspot' = bu yazma HubSpot'tan geldi, geri itilmez
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_contacts_client_idx on public.client_contacts (org_id, client_id);
create index if not exists client_contacts_brand_idx on public.client_contacts (org_id, brand_id);
create index if not exists client_contacts_email_idx on public.client_contacts (org_id, lower(email)) where email <> '';
create unique index if not exists client_contacts_source_ref_uq on public.client_contacts (org_id, source_ref) where source_ref is not null;
create index if not exists client_contacts_updated_idx on public.client_contacts (org_id, updated_at desc);
drop trigger if exists client_contacts_touch on public.client_contacts;
create trigger client_contacts_touch before insert or update on public.client_contacts for each row execute function core.sync_touch();
drop trigger if exists client_contacts_emit on public.client_contacts;
create trigger client_contacts_emit after insert or update on public.client_contacts for each row execute function core.emit_event();

alter table public.client_contacts enable row level security;
-- Okuma: iç roller hepsini; müşteri rolleri kendi müşterisinin (client_id) kişilerini (marka boş olsa da).
drop policy if exists client_contacts_r on public.client_contacts;
create policy client_contacts_r on public.client_contacts for select using (
  org_id in (select core.my_orgs()) and (core.is_internal(org_id) or client_id = any(core.client_ids(org_id)))
);
drop policy if exists client_contacts_i on public.client_contacts;
create policy client_contacts_i on public.client_contacts for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
drop policy if exists client_contacts_u on public.client_contacts;
create policy client_contacts_u on public.client_contacts for update
  using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
drop policy if exists client_contacts_d on public.client_contacts;
create policy client_contacts_d on public.client_contacts for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
-- `raw` HubSpot'tan gelir; JS yazması sync_origin'i dokunma tetikleyicisiyle temizler (geri itme ölçütü updated_at > synced_at).

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'client_contacts') then
      alter publication supabase_realtime add table public.client_contacts;
    end if;
  end if;
end $$;

/* ───────── B) integration_links ───────── */
create table if not exists public.integration_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,                  -- 'hubspot'
  entity text not null,                    -- company | contact | deal | owner
  local_id text not null,                  -- JS kaydı (clients.id / brands.id / client_contacts.id / crm_deals.id / employees.id)
  remote_id text not null,                 -- HubSpot nesne id'si
  remote_updated_at timestamptz,           -- HubSpot updatedAt (son görülen)
  local_updated_at timestamptz,            -- JS updated_at (son eşitlemede)
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, entity, remote_id)
);
create index if not exists integration_links_local_idx on public.integration_links (org_id, provider, entity, local_id);
alter table public.integration_links enable row level security;
drop policy if exists integration_links_r on public.integration_links;
create policy integration_links_r on public.integration_links for select using (core.has_role(org_id, array['owner','org_admin','integration_admin','operations','account','pm']::core.app_role[]));
revoke insert, update, delete on public.integration_links from authenticated, anon;

/* ───────── C) clients / brands / crm_deals: dış bağ + çakışma saati ───────── */
alter table public.clients add column if not exists source_ref text;
alter table public.clients add column if not exists updated_at timestamptz not null default now();
alter table public.clients add column if not exists sync_origin text;
alter table public.clients add column if not exists synced_at timestamptz;
create unique index if not exists clients_source_ref_uq on public.clients (org_id, source_ref) where source_ref is not null;
drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before insert or update on public.clients for each row execute function core.sync_touch();
drop trigger if exists clients_emit on public.clients;
create trigger clients_emit after insert or update on public.clients for each row execute function core.emit_event();  -- JS → HubSpot itmesi olay hattından

alter table public.brands add column if not exists source_ref text;
alter table public.brands add column if not exists updated_at timestamptz not null default now();
alter table public.brands add column if not exists sync_origin text;
alter table public.brands add column if not exists synced_at timestamptz;
create index if not exists brands_source_ref_idx on public.brands (org_id, source_ref) where source_ref is not null;
drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before insert or update on public.brands for each row execute function core.sync_touch();

alter table public.crm_deals add column if not exists source_ref text;
alter table public.crm_deals add column if not exists updated_at timestamptz not null default now();
alter table public.crm_deals add column if not exists sync_origin text;
alter table public.crm_deals add column if not exists synced_at timestamptz;
create unique index if not exists crm_deals_source_ref_uq on public.crm_deals (org_id, source_ref) where source_ref is not null;
create index if not exists crm_deals_updated_idx on public.crm_deals (org_id, updated_at desc);
drop trigger if exists crm_deals_touch on public.crm_deals;
create trigger crm_deals_touch before insert or update on public.crm_deals for each row execute function core.sync_touch();

-- Senkron günlüğü varlıkları: company | brand | contact | deal | integration (0008 tablosu; sağlayıcı='hubspot').
-- CRM kullanıcıları (operations/account/pm) da günlüğü okur: fırsat kartında "atlanan çakışma" göstergesi.
drop policy if exists isl_r on public.integration_sync_log;
create policy isl_r on public.integration_sync_log for select using (core.has_role(org_id, array['owner','org_admin','integration_admin','operations','account','pm']::core.app_role[]));
