-- JS Ecosystem · 0015 Kurul Sohbeti (apps/admin → Yönetim Kurulu → Kurul Sohbeti)
-- Kurucunun CHAIR (kurul) ile kalıcı Soru-Cevap / çalışma alanı: konu başlıkları (board_threads) ve mesajlar (board_messages).
-- Asistan mesajı yapılandırılmış plan (görev dağılımı + yapılacaklar listesi) taşıyabilir; plan "uygula" ile public.tasks'a aktarılır
-- (source_ref = 'board:<thread_id>:<message_id>', labels ⊇ {'kurul'}). Maliyet agent_runs'a (agent='chair', trigger='board_chat') yazılır.
-- Erişim: yalnızca owner / org_admin (servis rolü RLS'i zaten aşar; panel rotaları servis rolüyle çalışır).

create table if not exists public.board_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default 'Yeni konu' check (length(title) between 1 and 200),
  created_by uuid,                                   -- auth.users.id (FK yok: kullanıcı silinse de konu kalsın)
  status text not null default 'open' check (status in ('open','archived')),
  summary text,                                      -- eski mesajların model tarafından üretilen özeti (bağlam sıkıştırma)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_threads_org_idx on public.board_threads (org_id, status, updated_at desc);

create table if not exists public.board_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.board_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,    -- [{name, bytes, text}] — .md/.txt metni satır içi (dosya başı 200 KB, mesaj başı 600 KB)
  plan jsonb,                                        -- BoardPlan (packages/contracts/src/board-chat.ts) ya da null
  tokens_in int not null default 0, tokens_out int not null default 0,
  cost_usd numeric(10,5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists board_messages_thread_idx on public.board_messages (org_id, thread_id, created_at);

create or replace function core.board_thread_touch() returns trigger language plpgsql as $$
begin
  update public.board_threads set updated_at = now() where id = new.thread_id;
  return new;
end $$;
drop trigger if exists board_messages_touch on public.board_messages;
create trigger board_messages_touch after insert on public.board_messages for each row execute function core.board_thread_touch();

alter table public.board_threads  enable row level security;
alter table public.board_messages enable row level security;

drop policy if exists bth_rw on public.board_threads;
create policy bth_rw on public.board_threads for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

drop policy if exists bms_rw on public.board_messages;
create policy bms_rw on public.board_messages for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

grant select, insert, update, delete on public.board_threads, public.board_messages to authenticated, service_role;

-- Plandan üretilen görevleri hızlı bulmak için (source_ref 'board:…' öneki).
create index if not exists tasks_source_ref_idx on public.tasks (org_id, source_ref) where source_ref is not null;
