-- JS Ecosystem · 0013 REA: Ters Mühendislik Stüdyosu (apps/rea)
-- Şema `rea`: projects, runs, findings. Erişim yalnızca owner / org_admin (core.has_role).
-- NOT: Supabase > Settings > API > "Exposed schemas" listesine `rea` eklenmeli (README'ye bak).
-- Bu dosya elle çalıştırılır; apps/rea uygulaması çalıştırmaz.

create schema if not exists rea;

create table rea.projects (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  created_by    uuid references auth.users(id) on delete set null,
  name          text not null check (char_length(name) between 2 and 120),
  target_kind   text not null check (target_kind in ('web','bundle','local')),
  target_url    text,                       -- web: incelenecek adres
  upload_path   text,                       -- bundle/local: rea-uploads bucket yolu "<org_id>/<uuid>/<dosya>"
  upload_name   text,
  upload_bytes  bigint,
  question      text not null default '' check (char_length(question) <= 2000),
  seeds         text[] not null default '{}', -- aranacak fonksiyon / mesaj adları
  status        text not null default 'draft' check (status in ('draft','queued','running','done','failed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rea_projects_target check (
    (target_kind = 'web' and target_url is not null) or (target_kind in ('bundle','local') and upload_path is not null) or status = 'draft')
);
create index on rea.projects (org_id, created_at desc);

create table rea.runs (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references rea.projects(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  status          text not null default 'queued' check (status in ('queued','running','done','failed')),
  stage           text,                      -- hazirlik | indirme | analiz | ozet | kayit
  progress        int  not null default 0 check (progress between 0 and 100),
  message         text,
  log             jsonb not null default '[]'::jsonb,   -- son ilerleme satırları (en çok 80)
  error           text,
  summary         jsonb,                     -- REA `inspect-analysis-view` summary görünümü
  digest          jsonb,                     -- uygulamanın çıkardığı kanıt listesi (dosya, satır, kısa snippet)
  evidence        jsonb,                     -- ham REA çıktısı (en çok 5 MB; büyükse null)
  evidence_bytes  bigint,
  evidence_truncated boolean not null default false,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on rea.runs (project_id, created_at desc);

create table rea.findings (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references rea.projects(id) on delete cascade,
  run_id      uuid references rea.runs(id) on delete set null,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  kind        text not null check (kind in ('synthesis','note')),
  title       text not null,
  body        jsonb not null,                -- AI sentez şeması (adımlar, kör noktalar, yardımcı programlar)
  model       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on rea.findings (project_id, created_at desc);

create or replace function rea.touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger projects_touch before update on rea.projects for each row execute function rea.touch();

alter table rea.projects enable row level security;
alter table rea.runs     enable row level security;
alter table rea.findings enable row level security;

create policy projects_all on rea.projects for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy runs_all on rea.runs for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy findings_all on rea.findings for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

grant usage on schema rea to authenticated, service_role;
grant select, insert, update, delete on all tables in schema rea to authenticated, service_role;
alter default privileges in schema rea grant select, insert, update, delete on tables to authenticated, service_role;

-- Yüklemeler (≤ 45 MiB): özel bucket. Tarayıcı, sunucunun verdiği imzalı URL ile yazar; sunucu service_role ile okur.
insert into storage.buckets (id, name, public, file_size_limit)
values ('rea-uploads', 'rea-uploads', false, 47185920)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy rea_uploads_read on storage.objects for select to authenticated
  using (bucket_id = 'rea-uploads'
         and core.has_role(((storage.foldername(name))[1])::uuid, array['owner','org_admin']::core.app_role[]));
