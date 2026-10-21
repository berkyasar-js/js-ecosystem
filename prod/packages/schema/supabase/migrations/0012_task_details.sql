-- JS Ecosystem · 0012 görev ayrıntıları (Trello kart özellikleri): açıklama, kapak, yorumlar, checklist'ler, dosyalar + Storage kovası `task-files`.
-- Trello iki yönlü senkron için her alt tabloda `external_id` (Trello id, unique) + `sync_origin/synced_at/updated_at` (döngü koruması, 0008 ile aynı kural).

/* 1) tasks: açıklama + kapak ({color?: 'blue'|…, attachment_id?: uuid}) */
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists cover jsonb;

/* 2) Tablolar */
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid,                                   -- auth.users.id; Trello'dan gelen yorumda null
  author_name text not null default '',
  body text not null check (length(body) between 1 and 20000),
  external_id text unique,                          -- Trello commentCard action id ('pending:<id>' = itme sırasında geçici kilit)
  sync_origin text, synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null check (length(name) between 1 and 500),
  position int not null default 0,
  external_id text unique,
  sync_origin text, synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_check_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  checklist_id uuid not null references public.task_checklists(id) on delete cascade,
  name text not null check (length(name) between 1 and 1000),
  checked boolean not null default false,
  position int not null default 0,
  due_at timestamptz,
  assignee_id uuid references public.employees(id) on delete set null,
  external_id text unique,
  sync_origin text, synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  name text not null check (length(name) between 1 and 500),
  url text not null default '',                     -- harici bağlantı (ya da Trello yedek adresi); Storage dosyasında boş
  mime text not null default '', bytes bigint not null default 0,
  storage_path text,                                -- 'task-files' kovasında '<org_id>/<task_id>/<uuid>-<ad>'
  external_id text unique,
  uploaded_by uuid,
  sync_origin text, synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
create index if not exists task_checklists_task_idx on public.task_checklists (task_id, position);
create index if not exists task_check_items_cl_idx on public.task_check_items (checklist_id, position);
create index if not exists task_attachments_task_idx on public.task_attachments (task_id, created_at);

/* 3) Yardımcılar */
create or replace function core.checklist_task(p_checklist uuid) returns uuid language sql stable security definer set search_path = public as
$$ select task_id from public.task_checklists where id = p_checklist $$;

-- Yazma: owner/org_admin/operations/account/pm/creative her görevde; freelancer yalnızca kendine atanmış (ya da atanmamış) görevde (tasks_u ile aynı kural).
create or replace function core.can_write_task(p_org uuid, p_task uuid) returns boolean language sql stable security definer set search_path = public as $$
  select core.has_role(p_org, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])
      or (core.has_role(p_org, array['freelancer']::core.app_role[])
          and exists (select 1 from public.tasks t where t.id = p_task and t.org_id = p_org and (t.assignee_id = core.me() or t.assignee_id is null)))
$$;

/* 4) BEFORE tetikleyici: updated_at, döngü işaretçisi (0008 tasks_touch ile aynı) + istemci sahteciliği koruması.
      İstemci (service_role değil) INSERT'te external_id/sync_* gönderemez; UPDATE'te external_id değişmez. */
create or replace function core.detail_touch() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    if tg_op = 'INSERT' then new.external_id := null; new.sync_origin := null; new.synced_at := null;
    else new.external_id := old.external_id; new.sync_origin := old.sync_origin; new.synced_at := old.synced_at; end if;
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.sync_origin is not distinct from old.sync_origin and new.synced_at is not distinct from old.synced_at then
    new.sync_origin := null;                  -- JS tarafı yazma: işareti temizle
  elsif new.sync_origin = 'trello' then
    new.synced_at := new.updated_at;          -- Trello kaynaklı yazma: synced_at == updated_at (0010 ile aynı saat kayması koruması)
  end if;
  return new;
end $$;

/* 5) Olaylar: yorum eklenince 'task.commented' (aggregate=tasks); diğer her şey '<tablo>.<insert|update|delete>' (payload: task_id, new, old — silmede old dolu).
      Görev silinirken (cascade) olay üretilmez. */
create or replace function core.emit_task_commented() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (org_id, type, aggregate, aggregate_id, payload)
  values (new.org_id, 'task.commented', 'tasks', new.task_id, jsonb_build_object('task_id', new.task_id, 'comment_id', new.id, 'new', to_jsonb(new), 'old', null));
  return new;
end $$;
create or replace function core.emit_detail_event() returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb := to_jsonb(coalesce(new, old)); v_task uuid;
begin
  v_task := case tg_table_name when 'task_check_items' then core.checklist_task((v_row ->> 'checklist_id')::uuid) else (v_row ->> 'task_id')::uuid end;
  if v_task is null or not exists (select 1 from public.tasks where id = v_task) then return coalesce(new, old); end if;
  insert into public.events (org_id, type, aggregate, aggregate_id, payload)
  values ((v_row ->> 'org_id')::uuid, tg_table_name || '.' || lower(tg_op), tg_table_name, (v_row ->> 'id')::uuid,
          jsonb_build_object('task_id', v_task, 'new', case when tg_op <> 'DELETE' then to_jsonb(new) end, 'old', case when tg_op <> 'INSERT' then to_jsonb(old) end));
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['task_comments','task_checklists','task_check_items','task_attachments'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function core.detail_touch()', t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
drop trigger if exists task_comments_emit_ins on public.task_comments;
create trigger task_comments_emit_ins after insert on public.task_comments for each row execute function core.emit_task_commented();
drop trigger if exists task_comments_emit on public.task_comments;
create trigger task_comments_emit after update or delete on public.task_comments for each row execute function core.emit_detail_event();
drop trigger if exists task_checklists_emit on public.task_checklists;
create trigger task_checklists_emit after insert or update or delete on public.task_checklists for each row execute function core.emit_detail_event();
drop trigger if exists task_check_items_emit on public.task_check_items;
create trigger task_check_items_emit after insert or update or delete on public.task_check_items for each row execute function core.emit_detail_event();
drop trigger if exists task_attachments_emit on public.task_attachments;
create trigger task_attachments_emit after insert or update or delete on public.task_attachments for each row execute function core.emit_detail_event();

/* 6) RLS: okuma = iç roller (müşteri rolleri görmez); yazma = can_write_task. Yorumu yalnızca yazarı (ya da owner/org_admin/operations) düzenler/siler. */
drop policy if exists tcm_r on public.task_comments;  drop policy if exists tcm_i on public.task_comments;  drop policy if exists tcm_u on public.task_comments;  drop policy if exists tcm_d on public.task_comments;
create policy tcm_r on public.task_comments for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy tcm_i on public.task_comments for insert with check (core.can_write_task(org_id, task_id) and (author_id is null or author_id = auth.uid()));
create policy tcm_u on public.task_comments for update using (core.can_write_task(org_id, task_id) and (author_id = auth.uid() or core.has_role(org_id, array['owner','org_admin','operations']::core.app_role[])))
  with check (core.can_write_task(org_id, task_id));
create policy tcm_d on public.task_comments for delete using (core.can_write_task(org_id, task_id) and (author_id = auth.uid() or core.has_role(org_id, array['owner','org_admin','operations']::core.app_role[])));

drop policy if exists tcl_r on public.task_checklists; drop policy if exists tcl_w on public.task_checklists;
create policy tcl_r on public.task_checklists for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy tcl_w on public.task_checklists for all using (core.can_write_task(org_id, task_id)) with check (core.can_write_task(org_id, task_id));

drop policy if exists tci_r on public.task_check_items; drop policy if exists tci_w on public.task_check_items;
create policy tci_r on public.task_check_items for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy tci_w on public.task_check_items for all using (core.can_write_task(org_id, core.checklist_task(checklist_id))) with check (core.can_write_task(org_id, core.checklist_task(checklist_id)));

drop policy if exists tat_r on public.task_attachments; drop policy if exists tat_w on public.task_attachments;
create policy tat_r on public.task_attachments for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy tat_w on public.task_attachments for all using (core.can_write_task(org_id, task_id)) with check (core.can_write_task(org_id, task_id));

grant execute on function core.can_write_task(uuid, uuid), core.checklist_task(uuid) to authenticated, service_role;

/* 7) Storage: özel kova `task-files` (25 MB sınır). Yol öneki '<org_id>/…'; okuma = o org'un iç üyeleri; yazma = görev yazabilen iç roller.
      (Dashboard → Storage'tan elle de açılabilir: ad `task-files`, Public KAPALI, dosya sınırı 25 MB.) */
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists task_files_r on storage.objects; drop policy if exists task_files_i on storage.objects;
drop policy if exists task_files_u on storage.objects; drop policy if exists task_files_d on storage.objects;
create policy task_files_r on storage.objects for select to authenticated using (
  bucket_id = 'task-files' and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.org_id::text = (storage.foldername(name))[1] and m.role not in ('client_admin','client_viewer')));
create policy task_files_i on storage.objects for insert to authenticated with check (
  bucket_id = 'task-files' and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.org_id::text = (storage.foldername(name))[1] and m.role in ('owner','org_admin','operations','account','pm','creative','freelancer')));
create policy task_files_u on storage.objects for update to authenticated using (
  bucket_id = 'task-files' and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.org_id::text = (storage.foldername(name))[1] and m.role in ('owner','org_admin','operations','account','pm','creative','freelancer')));
create policy task_files_d on storage.objects for delete to authenticated using (
  bucket_id = 'task-files' and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.org_id::text = (storage.foldername(name))[1] and m.role in ('owner','org_admin','operations','account','pm','creative','freelancer')));
