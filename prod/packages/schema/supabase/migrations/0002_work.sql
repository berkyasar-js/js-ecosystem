-- JS Ecosystem · 0002 work: clients, brands, projects, tasks, time, approvals, comms, surveys, consent
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, sector text, contact text, email text, domain text,
  created_at timestamptz not null default now()
);
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, sector text,
  status text not null default 'active' check (status in ('active','risky','prospect')),
  account_owner uuid references public.employees(id),
  art_director uuid references public.employees(id),
  copywriter uuid references public.employees(id),
  compliance_flags text[] not null default '{}',
  monthly_quota jsonb not null default '{}'::jsonb,      -- {"social_visual":2,"reels":1}
  health int not null default 70, internal boolean not null default false,
  created_at timestamptz not null default now()
);
create type core.flow_stage as enum ('brief','scope','plan','production','internal_review','approval','delivery','archive');
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null, type text, summary text,
  status text not null default 'active' check (status in ('planning','active','done','paused')),
  flow_stage core.flow_stage not null default 'brief',
  flow_owner uuid references public.employees(id),
  stage_plan jsonb not null default '[]'::jsonb,
  due_at timestamptz, budget_minor bigint not null default 0,
  client_visible boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.task_types (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null, label text not null, sla_hours int not null default 72,
  default_minutes int not null default 240, unit_price_minor bigint not null default 0,
  primary key (org_id, key)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  assignee_id uuid references public.employees(id),
  state core.flow_stage not null default 'brief',
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_at timestamptz, planned_minutes int not null default 0,
  task_type text not null default 'general', qty int not null default 1,
  source_ref text, labels text[] not null default '{}',
  client_visible boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.tasks (org_id, state);
create index on public.tasks (project_id);
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  minutes int not null check (minutes > 0), note text, worked_on date not null default current_date,
  created_at timestamptz not null default now()
);
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  action_type text not null check (action_type in ('content','budget','scope','client_decision','access')),
  title text not null, subject jsonb not null default '{}'::jsonb,
  required_role core.app_role not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.employees(id),
  decided_by uuid, decided_at timestamptz, decision_note text,
  due_at timestamptz, created_at timestamptz not null default now()
);
create index on public.approvals (org_id, status);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, kind text not null default 'channel' check (kind in ('channel','dm','inbox')),
  brand_id uuid references public.brands(id) on delete set null
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid, author_name text not null default '', body text not null,
  meta jsonb not null default '{}'::jsonb,    -- inbox: {"from","subject","brand_id"}
  created_at timestamptz not null default now()
);
create index on public.messages (channel_id, created_at);
alter publication supabase_realtime add table public.messages;

create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null, questions jsonb not null default '[]'::jsonb, public_token text unique default encode(gen_random_bytes(12),'hex'),
  created_at timestamptz not null default now()
);
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

-- KVKK rıza + ekran aktivitesi (rıza yoksa insert reddedilir)
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  purpose text not null, granted boolean not null default true,
  granted_at timestamptz not null default now(), revoked_at timestamptz
);
create table public.screen_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  app text not null, minutes int not null default 1, captured_at timestamptz not null default now()
);
create or replace function core.require_screen_consent() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.consents c where c.employee_id = new.employee_id and c.purpose = 'screen_activity' and c.granted and c.revoked_at is null) then
    raise exception 'screen_activity icin gecerli riza (consents) yok' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger screen_activity_consent before insert on public.screen_activity for each row execute function core.require_screen_consent();

-- Müşteri rolleri yalnızca scopes.client_ids içindeki markaları görür
create or replace function core.can_see_brand(p_org uuid, p_brand uuid) returns boolean language sql stable security definer set search_path = public as
$$ select p_org in (select core.my_orgs()) and (core.is_internal(p_org) or exists (select 1 from public.brands b where b.id = p_brand and b.client_id = any(core.client_ids(p_org)))) $$;

-- ───── RLS ─────
do $$ declare t text; begin
  foreach t in array array['clients','brands','projects','task_types','tasks','time_entries','approvals','channels','messages','surveys','survey_responses','consents','screen_activity'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

create policy clients_r on public.clients for select using (org_id in (select core.my_orgs()) and (core.is_internal(org_id) or id = any(core.client_ids(org_id))));
create policy clients_w on public.clients for all using (core.has_role(org_id, array['owner','org_admin','operations','account']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account']::core.app_role[]));
create policy brands_r on public.brands for select using (core.can_see_brand(org_id, id));
create policy brands_w on public.brands for all using (core.has_role(org_id, array['owner','org_admin','operations','account']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account']::core.app_role[]));
create policy projects_r on public.projects for select using (core.can_see_brand(org_id, brand_id) and (core.is_internal(org_id) or client_visible));
create policy projects_w on public.projects for all using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy tt_r on public.task_types for select using (org_id in (select core.my_orgs()));
create policy tt_w on public.task_types for all using (core.has_role(org_id, array['owner','org_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy tasks_r on public.tasks for select using (org_id in (select core.my_orgs()) and (core.is_internal(org_id) or (client_visible and exists (select 1 from public.projects p where p.id = project_id and core.can_see_brand(p.org_id, p.brand_id)))));
create policy tasks_w on public.tasks for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy tasks_u on public.tasks for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]) and (core.role(org_id) not in ('creative','freelancer') or assignee_id = core.me() or assignee_id is null));
create policy tasks_d on public.tasks for delete using (core.has_role(org_id, array['owner','org_admin','operations','pm']::core.app_role[]));
create policy time_r on public.time_entries for select using (employee_id = core.me() or core.has_role(org_id, array['owner','org_admin','operations','pm','finance']::core.app_role[]));
create policy time_w on public.time_entries for insert with check (employee_id = core.me());
create policy appr_r on public.approvals for select using (org_id in (select core.my_orgs()) and (core.is_internal(org_id) or (required_role in ('client_admin','client_viewer') and core.can_see_brand(org_id, nullif(subject ->> 'brand_id','')::uuid))));
create policy appr_i on public.approvals for insert with check (org_id in (select core.my_orgs()) and core.is_internal(org_id));
-- Karar: yalnızca required_role sahibi veya owner (org_admin owner-onaylarını veremez). Asıl kural API'de (canDecideApproval) tekrarlanır.
create policy appr_u on public.approvals for update using (
  core.role(org_id) = required_role or core.has_role(org_id, array['owner']::core.app_role[])
  or (core.has_role(org_id, array['org_admin']::core.app_role[]) and required_role <> 'owner')
  or (required_role = 'pm' and core.has_role(org_id, array['operations','account']::core.app_role[])));
create policy ch_r on public.channels for select using (org_id in (select core.my_orgs()) and (kind <> 'inbox' or core.is_internal(org_id)));
create policy ch_w on public.channels for all using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy msg_r on public.messages for select using (exists (select 1 from public.channels c where c.id = channel_id and c.org_id in (select core.my_orgs()) and (c.kind <> 'inbox' or core.is_internal(c.org_id))));
create policy msg_w on public.messages for insert with check (org_id in (select core.my_orgs()) and author_id = auth.uid());
create policy sv_r on public.surveys for select using (org_id in (select core.my_orgs()));
create policy sv_w on public.surveys for all using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy svr_r on public.survey_responses for select using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy cons_r on public.consents for select using (employee_id = core.me() or core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy cons_w on public.consents for all using (employee_id = core.me()) with check (employee_id = core.me());
create policy scr_r on public.screen_activity for select using (employee_id = core.me());
create policy scr_w on public.screen_activity for insert with check (employee_id = core.me());
