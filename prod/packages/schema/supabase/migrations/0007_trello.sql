-- JS Ecosystem · 0007 Trello entegrasyonu: integrations.config (sunucu-tarafı sırlar) + last_sync_at, görev eşleme indeksi
alter table public.integrations add column if not exists config jsonb not null default '{}'::jsonb;  -- trello: {api_key, token, board_ids, webhook_ids, member_map, ...}
alter table public.integrations add column if not exists last_sync_at timestamptz;

-- config (API anahtarı + token) istemci rollerinden gizlenir; yalnızca servis rolü (Next.js sunucu rotaları) okur/yazar.
-- 0003'teki int_r politikası finans/denetçi rollerine satır okuma verir → tablo-seviyesi grant'ı kaldırıp sütun listesi veriyoruz (0006'daki access_tokens deseni).
revoke select on public.integrations from authenticated, anon;
grant select (id, org_id, provider, name, status, scopes, secret_ref, created_at, last_sync_at) on public.integrations to authenticated;
revoke insert, update on public.integrations from authenticated, anon;
grant insert (org_id, provider, name, status, scopes, secret_ref), update (name, status, scopes, secret_ref) on public.integrations to authenticated;

-- İdempotent upsert: Trello görevleri source_ref='trello:<cardId>' ile aranır.
create index if not exists tasks_trello_ref_idx on public.tasks (org_id, source_ref) where source_ref like 'trello:%';
