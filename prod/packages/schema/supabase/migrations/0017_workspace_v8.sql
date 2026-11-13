-- JS Ecosystem · 0017 V8 çalışma alanı: kayıtlı görünümler, kilometre taşları, iş talepleri, alan sahipliği, duyurular,
-- proje üyeleri (proje rolleri), ajan politikaları + ajan onayları. 0016'dan bağımsız, idempotent (tekrar çalıştırılabilir).
-- Tablolar COLLECTIONS biçimindedir (id, org_id, [native kolonlar], data jsonb, created_at); RLS core.* yardımcılarıyla (0001/0014).

/* ───────── 1) Kayıtlı görünümler ───────── */
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null default auth.uid(),
  scope text not null default 'personal' check (scope in ('personal','org')),
  entity text not null default 'tasks' check (entity in ('tasks','projects','crm')),
  data jsonb not null default '{}'::jsonb,            -- {name, query}
  created_at timestamptz not null default now()
);
create index if not exists saved_views_org_idx on public.saved_views (org_id, entity, scope);
alter table public.saved_views enable row level security;
drop policy if exists saved_views_r on public.saved_views;
create policy saved_views_r on public.saved_views for select using (core.is_internal(org_id) and (scope = 'org' or owner_user_id = auth.uid()));
drop policy if exists saved_views_i on public.saved_views;
create policy saved_views_i on public.saved_views for insert with check (core.is_internal(org_id) and owner_user_id = auth.uid()
  and (scope = 'personal' or core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])));
drop policy if exists saved_views_u on public.saved_views;
create policy saved_views_u on public.saved_views for update using (owner_user_id = auth.uid() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (owner_user_id = auth.uid() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
drop policy if exists saved_views_d on public.saved_views;
create policy saved_views_d on public.saved_views for delete using (owner_user_id = auth.uid() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

/* ───────── 2) Kilometre taşları + tasks.milestone_id ───────── */
create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned','active','done','missed')),
  due_at timestamptz,
  data jsonb not null default '{}'::jsonb,            -- {name}
  created_at timestamptz not null default now()
);
create index if not exists milestones_project_idx on public.milestones (project_id, due_at);
alter table public.milestones enable row level security;
drop policy if exists milestones_r on public.milestones;
create policy milestones_r on public.milestones for select using (core.is_internal(org_id)
  or exists (select 1 from public.projects p where p.id = project_id and p.client_visible and core.can_see_brand(p.org_id, p.brand_id)));
drop policy if exists milestones_w on public.milestones;
create policy milestones_w on public.milestones for all
  using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
alter table public.tasks add column if not exists milestone_id uuid references public.milestones(id) on delete set null;
create index if not exists tasks_milestone_idx on public.tasks (milestone_id);

/* ───────── 3) İş talepleri (intake) ───────── */
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,      -- alan (area) = marka
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,       -- dönüştürüldüğü görev (bir görev birden çok talep)
  kind text not null default 'brief' check (kind in ('bug','idea','brief','client')),
  status text not null default 'new' check (status in ('new','triaged','converted','closed','rejected')),
  data jsonb not null default '{}'::jsonb,            -- {title, body, requester_employee_id, requester_name, client_visible}
  created_at timestamptz not null default now()
);
create index if not exists requests_org_idx on public.requests (org_id, status, created_at desc);
create index if not exists requests_task_idx on public.requests (task_id);
alter table public.requests enable row level security;
drop policy if exists requests_r on public.requests;
create policy requests_r on public.requests for select using (core.can_see_brand(org_id, brand_id));   -- müşteri yalnızca kendi markasının talepleri; iç roller hepsi
drop policy if exists requests_i on public.requests;
create policy requests_i on public.requests for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
drop policy if exists requests_ci on public.requests;
create policy requests_ci on public.requests for insert with check (core.has_role(org_id, array['client_admin']::core.app_role[]) and brand_id is not null and core.can_see_brand(org_id, brand_id));
drop policy if exists requests_u on public.requests;
create policy requests_u on public.requests for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]))
  with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
drop policy if exists requests_d on public.requests;
create policy requests_d on public.requests for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
-- Görev teslim/arşive geçince bağlı açık talepler kapanır.
create or replace function core.requests_close_on_task_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state in ('delivery','archive') and (old.state is distinct from new.state) then
    update public.requests set status = 'closed' where task_id = new.id and status in ('new','triaged','converted');
  end if;
  return new;
end $$;
drop trigger if exists tasks_close_requests on public.tasks;
create trigger tasks_close_requests after update of state on public.tasks for each row execute function core.requests_close_on_task_done();

/* ───────── 4) Alan sahipliği: markanın varsayılan sorumlusu ───────── */
alter table public.brands add column if not exists default_assignee_id uuid references public.employees(id) on delete set null;

/* ───────── 5) Duyurular + okundu/anket yanıtları ───────── */
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  requires_ack boolean not null default false,
  data jsonb not null default '{}'::jsonb,            -- {author_user_id, author_name, title, body, audience{all|teams[]|roles[]|project_ids[]}, poll{question,options[]}|null}
  created_at timestamptz not null default now()
);
create index if not exists announcements_org_idx on public.announcements (org_id, created_at desc);
alter table public.announcements enable row level security;
drop policy if exists announcements_r on public.announcements;
create policy announcements_r on public.announcements for select using (core.is_internal(org_id));   -- hedef kitle süzgeci uygulamada (audienceMatches)
drop policy if exists announcements_w on public.announcements;
create policy announcements_w on public.announcements for all
  using (core.has_role(org_id, array['owner','org_admin','operations','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','hr']::core.app_role[]));
create table if not exists public.announcement_acks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  data jsonb not null default '{}'::jsonb,            -- {user_name, answer, at}
  created_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);
alter table public.announcement_acks enable row level security;
drop policy if exists announcement_acks_r on public.announcement_acks;
create policy announcement_acks_r on public.announcement_acks for select using (core.is_internal(org_id));
drop policy if exists announcement_acks_i on public.announcement_acks;
create policy announcement_acks_i on public.announcement_acks for insert with check (core.is_internal(org_id) and user_id = auth.uid());
drop policy if exists announcement_acks_u on public.announcement_acks;
create policy announcement_acks_u on public.announcement_acks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists announcement_acks_d on public.announcement_acks;
create policy announcement_acks_d on public.announcement_acks for delete using (user_id = auth.uid() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

/* ───────── 6) Proje üyeleri (proje rolleri) ───────── */
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('viewer','collaborator','manager','admin')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, employee_id)
);
create index if not exists project_members_emp_idx on public.project_members (employee_id);
alter table public.project_members enable row level security;
create or replace function core.project_role(p_project uuid) returns text language sql stable security definer set search_path = public as
$$ select role from public.project_members where project_id = p_project and employee_id = core.me() limit 1 $$;
drop policy if exists project_members_r on public.project_members;
create policy project_members_r on public.project_members for select using (core.is_internal(org_id));   -- iç roller org genelinde okur
drop policy if exists project_members_w on public.project_members;
create policy project_members_w on public.project_members for all
  using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]) or core.project_role(project_id) in ('manager','admin'))
  with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]) or core.project_role(project_id) in ('manager','admin'));
-- Proje yöneticisi / admini (üyelik rolü) org rolünden bağımsız proje meta verisini düzenleyebilir.
drop policy if exists projects_member_u on public.projects;
create policy projects_member_u on public.projects for update using (core.project_role(id) in ('manager','admin')) with check (core.project_role(id) in ('manager','admin'));

/* ───────── 7) Ajan politikaları + ajan onayları ───────── */
create table if not exists public.agent_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null,
  data jsonb not null default '{}'::jsonb,            -- {mode: ask|plan|act, monthly_budget_try, auto_approve{actions[], max_items}, note}
  created_at timestamptz not null default now(),
  unique (org_id, agent)
);
alter table public.agent_policies enable row level security;
drop policy if exists agent_policies_r on public.agent_policies;
create policy agent_policies_r on public.agent_policies for select using (core.has_role(org_id, array['owner','org_admin','auditor']::core.app_role[]));
drop policy if exists agent_policies_w on public.agent_policies;
create policy agent_policies_w on public.agent_policies for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
-- approvals.action_type: 'agent' (ajan yazma önerisi; subject.payload uygulanacak plan, subject.executed sonuç)
alter table public.approvals drop constraint if exists approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (action_type in ('content','budget','scope','client_decision','access','agent'));

/* ───────── 8) Erişim + Realtime ───────── */
grant select, insert, update, delete on public.saved_views, public.milestones, public.requests, public.announcements, public.announcement_acks, public.project_members, public.agent_policies to authenticated, service_role;
grant execute on function core.project_role(uuid), core.requests_close_on_task_done() to authenticated, service_role;
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['requests','announcements','announcement_acks','milestones','project_members'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
