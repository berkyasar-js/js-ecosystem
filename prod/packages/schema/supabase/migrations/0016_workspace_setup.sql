-- JS Ecosystem · 0016 Çalışma alanı & kurulum: user_prefs, çalışan hiyerarşisi, realtime yayını
-- 0015'ten bağımsızdır (sıra önemli değil). Kurulum sihirbazı durumu organizations.settings.setup (jsonb) içinde tutulur; ek sütun yok.

-- ───── Kullanıcı tercihleri: favoriler, karşılama bayrağı, gelen kutusu "tamam" kümesi, kenar çubuğu ─────
create table if not exists public.user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,   -- bilgi amaçlı: tercihler kullanıcıya aittir
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists user_prefs_own on public.user_prefs;
create policy user_prefs_own on public.user_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.user_prefs to authenticated;

-- ───── Çalışan hiyerarşisi: ekip adı, yönetici, işe giriş ─────
alter table public.employees add column if not exists manager_id uuid null references public.employees(id) on delete set null;
alter table public.employees add column if not exists team text null;
alter table public.employees add column if not exists hired_at date null;
create index if not exists employees_manager_idx on public.employees (org_id, manager_id);
create index if not exists employees_team_idx on public.employees (org_id, team);
alter table public.employees drop constraint if exists employees_not_own_manager;
alter table public.employees add constraint employees_not_own_manager check (manager_id is null or manager_id <> id);

-- organizations.settings varsayılanı değişmez ('{}'); setup/nav anahtarları uygulama tarafından yazılır.

-- ───── Realtime: ileride canlı gelen kutusu için görev / onay / bildirim tabloları yayına eklenir ─────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
      alter publication supabase_realtime add table public.tasks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'approvals') then
      alter publication supabase_realtime add table public.approvals;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
