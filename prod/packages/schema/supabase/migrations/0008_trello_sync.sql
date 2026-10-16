-- JS Ecosystem · 0008 Trello iki yönlü senkron: tasks.updated_at / sync_origin, projects.source_ref, integration_sync_log

/* 1) tasks.updated_at (son-yazan-kazanır karşılaştırması) + döngü işaretçisi.
      Geri doldurma (updated_at = created_at) emit_event tetikleyicisini tetiklememeli → geçici olarak devre dışı. */
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
alter table public.tasks add column if not exists sync_origin text;        -- 'trello' = bu yazma Trello'dan geldi, geri itilmez
alter table public.tasks add column if not exists synced_at timestamptz;
alter table public.tasks disable trigger tasks_emit;
update public.tasks set updated_at = created_at where updated_at > created_at;
alter table public.tasks enable trigger tasks_emit;

-- BEFORE UPDATE: updated_at her yazmada tazelenir; sync_origin/synced_at'e dokunmayan (= JS tarafı) yazma işareti temizler.
-- İçe aktarma her yazmada synced_at'i yeniler → işaret yalnızca o yazmada kalır.
create or replace function core.tasks_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.sync_origin is not distinct from old.sync_origin and new.synced_at is not distinct from old.synced_at then
    new.sync_origin := null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function core.tasks_touch();
create index if not exists tasks_updated_idx on public.tasks (org_id, updated_at desc);

/* 2) Trello kaynaklı projeler: source_ref = 'trello:board:<boardId>' (JS'te açılan yeni görev için kart hedef panosu) */
alter table public.projects add column if not exists source_ref text;
create index if not exists projects_source_ref_idx on public.projects (org_id, source_ref) where source_ref is not null;

/* 3) Senkron günlüğü: her uygulanan / atlanan değişiklik. Yazma yalnızca servis rolü; okuma entegrasyon yöneticileri. */
create table if not exists public.integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  direction text not null check (direction in ('push','pull','reconcile')),
  entity text not null,            -- task | card | project | webhook
  entity_id text,                  -- JS kaydı id'si
  external_id text,                -- Trello kart id'si
  action text not null,            -- created | updated | archived | skipped_conflict | skipped_origin | vanished | error ...
  ok boolean not null default true,
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists integration_sync_log_org_idx on public.integration_sync_log (org_id, provider, created_at desc);
alter table public.integration_sync_log enable row level security;
create policy isl_r on public.integration_sync_log for select using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
revoke insert, update, delete on public.integration_sync_log from authenticated, anon;
