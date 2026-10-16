-- JS Ecosystem · 0004 agents: twins, prompts, runs, board, decision rights
create table public.employee_twins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  kind text not null default 'person' check (kind in ('person','role')),
  name text not null,
  profile jsonb not null default '{}'::jsonb, defaults jsonb not null default '{}'::jsonb, preferences jsonb not null default '{}'::jsonb,
  opt_out boolean not null default false,
  approved_by_owner_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.agent_prompts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,   -- null = global varsayılan
  agent text not null, version int not null default 1,
  system_prompt text not null, model text not null default 'claude-sonnet-4-5',
  output_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, agent, version)
);
create unique index agent_prompts_one_active on public.agent_prompts (coalesce(org_id,'00000000-0000-0000-0000-000000000000'::uuid), agent) where is_active;
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null, trigger text not null default 'manual',
  input jsonb, output jsonb, model text,
  tokens_in int not null default 0, tokens_out int not null default 0,
  cost_usd numeric(10,5) not null default 0, latency_ms int not null default 0,
  status text not null default 'ok' check (status in ('ok','error','demo')),
  created_at timestamptz not null default now()
);
create index on public.agent_runs (org_id, created_at desc);
create table public.board_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id text not null, proposed_by text not null,
  level int not null check (level between 1 and 3),
  action text not null, rationale text not null default '',
  risk text not null default 'low' check (risk in ('low','medium','high')),
  votes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','deferred')),
  founder_answer text check (founder_answer in ('EVET','HAYIR','ERTELE')),
  created_at timestamptz not null default now(), decided_at timestamptz,
  unique (org_id, proposal_id)
);
create table public.decision_rights (
  org_id uuid not null references public.organizations(id) on delete cascade,
  action text not null, level int not null check (level between 1 and 3),
  decider text not null,            -- rol veya 'board' / 'founder'
  limit_minor bigint, notes text,
  primary key (org_id, action, level)
);

do $$ declare t text; begin
  foreach t in array array['employee_twins','agent_prompts','agent_runs','board_decisions','decision_rights'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

-- İkiz: kişi kendi ikizini görür/opt-out yapar; owner onaylar. opt_out=true ise başkaları okuyamaz.
create policy tw_r on public.employee_twins for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id) and (employee_id = core.me() or (not opt_out) or core.has_role(org_id, array['owner']::core.app_role[])));
create policy tw_self on public.employee_twins for update using (employee_id = core.me()) with check (employee_id = core.me());
create policy tw_owner on public.employee_twins for all using (core.has_role(org_id, array['owner']::core.app_role[])) with check (core.has_role(org_id, array['owner']::core.app_role[]));
create policy ap_r on public.agent_prompts for select using (org_id is null or core.has_role(org_id, array['owner','org_admin','auditor']::core.app_role[]));
create policy ap_w on public.agent_prompts for all using (org_id is not null and core.has_role(org_id, array['owner']::core.app_role[])) with check (org_id is not null and core.has_role(org_id, array['owner']::core.app_role[]));
create policy ar_r on public.agent_runs for select using (core.has_role(org_id, array['owner','org_admin','auditor','operations']::core.app_role[]));
create policy ar_i on public.agent_runs for insert with check (core.is_internal(org_id) and org_id in (select core.my_orgs()));
create policy bd_r on public.board_decisions for select using (core.has_role(org_id, array['owner','org_admin','auditor']::core.app_role[]));
create policy bd_u on public.board_decisions for update using (core.has_role(org_id, array['owner']::core.app_role[]));
create policy bd_i on public.board_decisions for insert with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy dr_r on public.decision_rights for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy dr_w on public.decision_rights for all using (core.has_role(org_id, array['owner']::core.app_role[])) with check (core.has_role(org_id, array['owner']::core.app_role[]));
