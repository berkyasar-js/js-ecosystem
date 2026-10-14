-- JS Ecosystem · 0001 core: organizations, memberships, employees, RLS helpers, audit
create extension if not exists pgcrypto;
create schema if not exists core;

create type core.app_role as enum ('owner','org_admin','operations','account','pm','creative','hr','payroll','finance','client_admin','client_viewer','freelancer','auditor','integration_admin');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role core.app_role not null,
  scopes jsonb not null default '{}'::jsonb,   -- {"client_ids":[...],"brand_ids":[...]} ; client rollerinde zorunlu
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);
create index on public.memberships (user_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  code text,                       -- UC, OE, SK ... prototip kısa kodu
  name text not null,
  role_title text not null default '',
  app_role core.app_role not null default 'creative',
  status text not null default 'active' check (status in ('active','left')),
  weekly_hours int not null default 40,
  last_day date,
  salary_minor bigint,             -- authenticated rolünden REVOKE edilir (aşağıda)
  hr_archive jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.employees (org_id);
create unique index on public.employees (auth_user_id) where auth_user_id is not null;

-- ───── RLS yardımcıları (JWT claim'leri: app_role, employee_id, client_id, org_id — auth hook ile eklenir) ─────
create or replace function core.my_orgs() returns setof uuid language sql stable security definer set search_path = public as
$$ select org_id from public.memberships where user_id = auth.uid() $$;

create or replace function core.role(p_org uuid default null) returns core.app_role language sql stable security definer set search_path = public as
$$ select coalesce(
     (select role from public.memberships where user_id = auth.uid() and org_id = coalesce(p_org, nullif(auth.jwt() ->> 'org_id','')::uuid) limit 1),
     nullif(auth.jwt() ->> 'app_role','')::core.app_role) $$;

create or replace function core.me() returns uuid language sql stable security definer set search_path = public as
$$ select coalesce(nullif(auth.jwt() ->> 'employee_id','')::uuid, (select id from public.employees where auth_user_id = auth.uid() limit 1)) $$;

create or replace function core.org() returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'org_id','')::uuid $$;

create or replace function core.has_role(p_org uuid, p_roles core.app_role[]) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.memberships where user_id = auth.uid() and org_id = p_org and role = any(p_roles)) $$;

create or replace function core.is_internal(p_org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.memberships where user_id = auth.uid() and org_id = p_org and role not in ('client_admin','client_viewer')) $$;

create or replace function core.client_ids(p_org uuid) returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce((select array(select jsonb_array_elements_text(scopes -> 'client_ids')::uuid) from public.memberships where user_id = auth.uid() and org_id = p_org), '{}') $$;

-- Auth hook: JWT'ye app_role / employee_id / client_id / org_id yazar (Dashboard → Auth → Hooks → Custom Access Token)
create or replace function core.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare claims jsonb := event -> 'claims'; m record; uid uuid := (event ->> 'user_id')::uuid;
begin
  select * into m from public.memberships where user_id = uid order by created_at limit 1;
  if found then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(m.role::text));
    claims := jsonb_set(claims, '{org_id}', to_jsonb(m.org_id::text));
    claims := jsonb_set(claims, '{employee_id}', coalesce((select to_jsonb(id::text) from public.employees where auth_user_id = uid limit 1), 'null'::jsonb));
    claims := jsonb_set(claims, '{client_id}', coalesce(m.scopes -> 'client_ids' -> 0, 'null'::jsonb));
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
grant usage on schema core to supabase_auth_admin;
grant execute on function core.custom_access_token_hook to supabase_auth_admin;

-- ───── Denetim ─────
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  resource text not null,
  outcome text not null default 'allow' check (outcome in ('allow','deny','error')),
  correlation_id text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index on public.audit_events (org_id, occurred_at desc);

-- ───── RLS ─────
alter table public.organizations enable row level security;
alter table public.memberships   enable row level security;
alter table public.employees     enable row level security;
alter table public.audit_events  enable row level security;

create policy org_read on public.organizations for select using (id in (select core.my_orgs()));
create policy org_update on public.organizations for update using (core.has_role(id, array['owner','org_admin']::core.app_role[]));
create policy mem_read on public.memberships for select using (user_id = auth.uid() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy mem_write on public.memberships for all using (core.has_role(org_id, array['owner','org_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy emp_read on public.employees for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy emp_write on public.employees for all using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy audit_read on public.audit_events for select using (core.has_role(org_id, array['owner','org_admin','auditor']::core.app_role[]));
create policy audit_insert on public.audit_events for insert with check (org_id in (select core.my_orgs()));

-- Maaş ve özlük arşivi: authenticated rolü okuyamaz; yalnızca definer fonksiyon (payroll rolü) veya service_role.
revoke select (salary_minor, hr_archive) on public.employees from authenticated, anon;
create or replace function core.payroll_read(p_org uuid) returns table (employee_id uuid, name text, salary_minor bigint)
language sql stable security definer set search_path = public as
$$ select e.id, e.name, e.salary_minor from public.employees e where e.org_id = p_org and core.has_role(p_org, array['payroll']::core.app_role[]) $$;
create or replace function core.hr_archive_read(p_org uuid) returns table (employee_id uuid, name text, hr_archive jsonb)
language sql stable security definer set search_path = public as
$$ select e.id, e.name, e.hr_archive from public.employees e where e.org_id = p_org and core.has_role(p_org, array['hr']::core.app_role[]) $$;
