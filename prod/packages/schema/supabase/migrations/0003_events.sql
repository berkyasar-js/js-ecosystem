-- JS Ecosystem · 0003 events & connect: events (outbox), emit_event trigger, bildirim, entegrasyon, MCP, token, webhook, KPI
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,               -- task.updated, approval.decided ...
  aggregate text not null,          -- tasks | approvals | invoices
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  occurred_at timestamptz not null default now(),
  processed_at timestamptz
);
create index on public.events (org_id, occurred_at desc);
create index on public.events (processed_at) where processed_at is null;

create or replace function core.emit_event() returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text := tg_table_name || '.' || lower(tg_op); v_row jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.events (org_id, type, aggregate, aggregate_id, payload)
  values ((v_row ->> 'org_id')::uuid, v_type, tg_table_name, (v_row ->> 'id')::uuid,
          jsonb_build_object('new', to_jsonb(new), 'old', case when tg_op = 'UPDATE' then to_jsonb(old) end));
  return coalesce(new, old);
end $$;
create trigger tasks_emit     after insert or update on public.tasks     for each row execute function core.emit_event();
create trigger approvals_emit after insert or update on public.approvals for each row execute function core.emit_event();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id), project_id uuid references public.projects(id),
  number text not null, amount_minor bigint not null, status text not null default 'pending' check (status in ('pending','paid','overdue')),
  issued_at date, due_at date, paid_at date
);
create trigger invoices_emit after insert or update on public.invoices for each row execute function core.emit_event();

create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null, channel text not null default 'in_app' check (channel in ('in_app','email','slack')),
  roles core.app_role[] not null default '{}', enabled boolean not null default true
);
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null, name text not null,
  status text not null default 'available' check (status in ('connected','available','error')),
  scopes text[] not null default '{}',
  secret_ref text,                  -- Supabase Vault secret adı; ham anahtar tabloda tutulmaz
  created_at timestamptz not null default now(), unique (org_id, provider)
);
create table public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, url text not null, status text not null default 'available' check (status in ('connected','available')),
  tools text[] not null default '{}'
);
create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, token_prefix text not null,
  token_hash text not null unique,  -- sha256(hex); ham token yalnızca oluşturulurken bir kez gösterilir
  scopes text[] not null default '{}', created_by uuid default auth.uid(),
  created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);
create table public.webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null, url text not null, events text[] not null default '{}', active boolean not null default true
);
create table public.kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kpi text not null, value numeric not null, dims jsonb not null default '{}'::jsonb, taken_at timestamptz not null default now()
);
create table public.system_health (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  component text not null, status text not null check (status in ('ok','degraded','down')), detail jsonb not null default '{}'::jsonb, checked_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['events','invoices','notification_rules','integrations','mcp_servers','access_tokens','webhooks','kpi_snapshots','system_health'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

create policy ev_r on public.events for select using (core.has_role(org_id, array['owner','org_admin','integration_admin','auditor']::core.app_role[]));
create policy inv_r on public.invoices for select using (core.has_role(org_id, array['owner','org_admin','finance','auditor','account']::core.app_role[]));
create policy inv_w on public.invoices for all using (core.has_role(org_id, array['owner','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','finance']::core.app_role[]));
create policy nr_r on public.notification_rules for select using (org_id in (select core.my_orgs()));
create policy nr_w on public.notification_rules for all using (core.has_role(org_id, array['owner','org_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy int_r on public.integrations for select using (core.has_role(org_id, array['owner','org_admin','integration_admin','operations','finance','auditor']::core.app_role[]));
create policy int_w on public.integrations for all using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
create policy mcp_r on public.mcp_servers for select using (core.has_role(org_id, array['owner','org_admin','integration_admin','operations','auditor']::core.app_role[]));
create policy mcp_w on public.mcp_servers for all using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
create policy tok_r on public.access_tokens for select using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
create policy tok_w on public.access_tokens for all using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
revoke select (token_hash) on public.access_tokens from authenticated, anon;
create policy wh_r on public.webhooks for select using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
create policy wh_w on public.webhooks for all using (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','integration_admin']::core.app_role[]));
create policy kpi_r on public.kpi_snapshots for select using (core.has_role(org_id, array['owner','org_admin','operations','finance','auditor']::core.app_role[]));
create policy sh_r on public.system_health for select using (org_id is null or core.has_role(org_id, array['owner','org_admin','integration_admin','auditor']::core.app_role[]));
