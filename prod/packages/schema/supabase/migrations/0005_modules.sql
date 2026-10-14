-- JS Ecosystem · 0005 modules — ÜRETİLDİ (gen-0005.mjs). Elle düzenleme: contracts/src/modules.ts → yeniden üret.
-- Ortak biçim: id, org_id, [brand_id], data jsonb, created_at. COLLECTIONS.native kolonları gerçek kolon; kalanı data içinde.
-- RLS: okuma modu = internal | rol listesi | brand_all | brand_visible (müşteri yalnızca kendi markası + client_visible); yazma = rol listesi.

-- Mevcut tablolara ek kolonlar
alter table public.time_entries alter column task_id drop not null;
alter table public.time_entries drop constraint if exists time_entries_minutes_check;
alter table public.time_entries add constraint time_entries_minutes_nonneg check (minutes >= 0);   -- çalışan zamanlayıcı: 0 dk + data.started_at
alter table public.time_entries add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.time_entries add column if not exists brand_id uuid references public.brands(id);
alter table public.invoices add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.invoices add column if not exists brand_id uuid references public.brands(id);
alter table public.surveys add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.surveys add column if not exists brand_id uuid references public.brands(id);
alter table public.survey_responses add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.survey_responses add column if not exists brand_id uuid references public.brands(id);
alter table public.invoices add column if not exists created_at timestamptz not null default now();
alter table public.time_entries alter column note drop not null;

create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.crm_deals (org_id, created_at desc);
alter table public.crm_deals enable row level security;
create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.crm_contacts (org_id, created_at desc);
alter table public.crm_contacts enable row level security;
create table public.crm_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.crm_proposals (org_id, created_at desc);
alter table public.crm_proposals enable row level security;
create table public.crm_contracts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.crm_contracts (org_id, created_at desc);
alter table public.crm_contracts enable row level security;
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.notifications (org_id, created_at desc);
alter table public.notifications enable row level security;
create table public.task_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.task_requests (org_id, created_at desc);
alter table public.task_requests enable row level security;
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.allocations (org_id, created_at desc);
alter table public.allocations enable row level security;
create table public.leaves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.leaves (org_id, created_at desc);
alter table public.leaves enable row level security;
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.skills (org_id, created_at desc);
alter table public.skills enable row level security;
create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.equipment (org_id, created_at desc);
alter table public.equipment enable row level security;
create table public.equipment_bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.equipment_bookings (org_id, created_at desc);
alter table public.equipment_bookings enable row level security;
create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.rate_cards (org_id, created_at desc);
alter table public.rate_cards enable row level security;
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.budgets (org_id, created_at desc);
alter table public.budgets enable row level security;
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.expenses (org_id, created_at desc);
alter table public.expenses enable row level security;
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.purchase_requests (org_id, created_at desc);
alter table public.purchase_requests enable row level security;
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.suppliers (org_id, created_at desc);
alter table public.suppliers enable row level security;
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.ledger_entries (org_id, created_at desc);
alter table public.ledger_entries enable row level security;
create table public.cost_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.cost_rates (org_id, created_at desc);
alter table public.cost_rates enable row level security;
create table public.hr_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.hr_profiles (org_id, created_at desc);
alter table public.hr_profiles enable row level security;
create table public.hr_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.hr_docs (org_id, created_at desc);
alter table public.hr_docs enable row level security;
create table public.hr_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.hr_assets (org_id, created_at desc);
alter table public.hr_assets enable row level security;
create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.trainings (org_id, created_at desc);
alter table public.trainings enable row level security;
create table public.perf_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.perf_reviews (org_id, created_at desc);
alter table public.perf_reviews enable row level security;
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.shifts (org_id, created_at desc);
alter table public.shifts enable row level security;
create table public.advances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.advances (org_id, created_at desc);
alter table public.advances enable row level security;
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.checklists (org_id, created_at desc);
alter table public.checklists enable row level security;
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.payroll_runs (org_id, created_at desc);
alter table public.payroll_runs enable row level security;
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.import_batches (org_id, created_at desc);
alter table public.import_batches enable row level security;
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.jobs (org_id, created_at desc);
alter table public.jobs enable row level security;
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.candidates (org_id, created_at desc);
alter table public.candidates enable row level security;
create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.interviews (org_id, created_at desc);
alter table public.interviews enable row level security;
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.offers (org_id, created_at desc);
alter table public.offers enable row level security;
create table public.client_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.client_requests (org_id, created_at desc);
alter table public.client_requests enable row level security;
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.media_assets (org_id, created_at desc);
alter table public.media_assets enable row level security;
create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.review_comments (org_id, created_at desc);
alter table public.review_comments enable row level security;
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.share_links (org_id, created_at desc);
alter table public.share_links enable row level security;
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.transfers (org_id, created_at desc);
alter table public.transfers enable row level security;
create table public.studio_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.studio_items (org_id, created_at desc);
alter table public.studio_items enable row level security;
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.social_posts (org_id, created_at desc);
alter table public.social_posts enable row level security;
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.decks (org_id, created_at desc);
alter table public.decks enable row level security;
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.campaigns (org_id, created_at desc);
alter table public.campaigns enable row level security;
create table public.segments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.segments (org_id, created_at desc);
alter table public.segments enable row level security;
create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.newsletters (org_id, created_at desc);
alter table public.newsletters enable row level security;
create table public.mkt_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.mkt_leads (org_id, created_at desc);
alter table public.mkt_leads enable row level security;
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.event_items (org_id, created_at desc);
alter table public.event_items enable row level security;
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.automations (org_id, created_at desc);
alter table public.automations enable row level security;
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.automation_runs (org_id, created_at desc);
alter table public.automation_runs enable row level security;
-- ───── RLS politikaları ─────
create policy crm_deals_r on public.crm_deals for select using (core.is_internal(org_id));
create policy crm_deals_i on public.crm_deals for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_deals_u on public.crm_deals for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_deals_d on public.crm_deals for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_contacts_r on public.crm_contacts for select using ((core.can_see_brand(org_id, brand_id)));
create policy crm_contacts_i on public.crm_contacts for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_contacts_u on public.crm_contacts for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_contacts_d on public.crm_contacts for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_proposals_r on public.crm_proposals for select using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance','auditor']::core.app_role[]));
create policy crm_proposals_i on public.crm_proposals for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[]));
create policy crm_proposals_u on public.crm_proposals for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[]));
create policy crm_proposals_d on public.crm_proposals for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[]));
create policy crm_contracts_r on public.crm_contracts for select using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance','auditor']::core.app_role[]));
create policy crm_contracts_i on public.crm_contracts for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_contracts_u on public.crm_contracts for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy crm_contracts_d on public.crm_contracts for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy notifications_r on public.notifications for select using (core.is_internal(org_id));
create policy notifications_i on public.notifications for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','payroll','freelancer']::core.app_role[]));
create policy notifications_u on public.notifications for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','payroll','freelancer']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','payroll','freelancer']::core.app_role[]));
create policy notifications_d on public.notifications for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','payroll','freelancer']::core.app_role[]));
create policy task_requests_r on public.task_requests for select using (core.is_internal(org_id));
create policy task_requests_i on public.task_requests for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
create policy task_requests_u on public.task_requests for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
create policy task_requests_d on public.task_requests for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
create policy allocations_r on public.allocations for select using (core.is_internal(org_id));
create policy allocations_i on public.allocations for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy allocations_u on public.allocations for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy allocations_d on public.allocations for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy leaves_r on public.leaves for select using (core.is_internal(org_id));
create policy leaves_i on public.leaves for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
create policy leaves_u on public.leaves for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy leaves_d on public.leaves for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','finance','hr','freelancer']::core.app_role[]));
create policy skills_r on public.skills for select using (core.is_internal(org_id));
create policy skills_i on public.skills for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy skills_u on public.skills for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy skills_d on public.skills for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy equipment_r on public.equipment for select using (core.is_internal(org_id));
create policy equipment_i on public.equipment for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy equipment_u on public.equipment for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy equipment_d on public.equipment for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy equipment_bookings_r on public.equipment_bookings for select using (core.is_internal(org_id));
create policy equipment_bookings_i on public.equipment_bookings for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy equipment_bookings_u on public.equipment_bookings for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy equipment_bookings_d on public.equipment_bookings for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy rate_cards_r on public.rate_cards for select using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance','auditor']::core.app_role[]));
create policy rate_cards_i on public.rate_cards for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[]));
create policy rate_cards_u on public.rate_cards for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[]));
create policy rate_cards_d on public.rate_cards for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','finance']::core.app_role[]));
create policy budgets_r on public.budgets for select using (core.has_role(org_id, array['owner','org_admin','finance','operations','account','pm','auditor']::core.app_role[]));
create policy budgets_i on public.budgets for insert with check (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy budgets_u on public.budgets for update using (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy budgets_d on public.budgets for delete using (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy expenses_r on public.expenses for select using (core.has_role(org_id, array['owner','org_admin','finance','operations','auditor']::core.app_role[]));
create policy expenses_i on public.expenses for insert with check (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy expenses_u on public.expenses for update using (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy expenses_d on public.expenses for delete using (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy purchase_requests_r on public.purchase_requests for select using (core.has_role(org_id, array['owner','org_admin','finance','operations','auditor']::core.app_role[]));
create policy purchase_requests_i on public.purchase_requests for insert with check (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy purchase_requests_u on public.purchase_requests for update using (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy purchase_requests_d on public.purchase_requests for delete using (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy suppliers_r on public.suppliers for select using (core.has_role(org_id, array['owner','org_admin','finance','operations','auditor']::core.app_role[]));
create policy suppliers_i on public.suppliers for insert with check (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy suppliers_u on public.suppliers for update using (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy suppliers_d on public.suppliers for delete using (core.has_role(org_id, array['owner','org_admin','finance','operations']::core.app_role[]));
create policy ledger_entries_r on public.ledger_entries for select using (core.has_role(org_id, array['owner','org_admin','finance','auditor']::core.app_role[]));
create policy ledger_entries_i on public.ledger_entries for insert with check (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy ledger_entries_u on public.ledger_entries for update using (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy ledger_entries_d on public.ledger_entries for delete using (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy cost_rates_r on public.cost_rates for select using (core.has_role(org_id, array['owner','org_admin','finance','auditor']::core.app_role[]));
create policy cost_rates_i on public.cost_rates for insert with check (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy cost_rates_u on public.cost_rates for update using (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy cost_rates_d on public.cost_rates for delete using (core.has_role(org_id, array['owner','org_admin','finance']::core.app_role[]));
create policy hr_profiles_r on public.hr_profiles for select using (core.is_internal(org_id));
create policy hr_profiles_i on public.hr_profiles for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy hr_profiles_u on public.hr_profiles for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy hr_profiles_d on public.hr_profiles for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy hr_docs_r on public.hr_docs for select using (core.has_role(org_id, array['hr']::core.app_role[]));
create policy hr_docs_i on public.hr_docs for insert with check (core.has_role(org_id, array['hr']::core.app_role[]));
create policy hr_docs_u on public.hr_docs for update using (core.has_role(org_id, array['hr']::core.app_role[])) with check (core.has_role(org_id, array['hr']::core.app_role[]));
create policy hr_docs_d on public.hr_docs for delete using (core.has_role(org_id, array['hr']::core.app_role[]));
create policy hr_assets_r on public.hr_assets for select using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy hr_assets_i on public.hr_assets for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy hr_assets_u on public.hr_assets for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy hr_assets_d on public.hr_assets for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy trainings_r on public.trainings for select using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy trainings_i on public.trainings for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy trainings_u on public.trainings for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy trainings_d on public.trainings for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy perf_reviews_r on public.perf_reviews for select using (core.has_role(org_id, array['hr','payroll']::core.app_role[]));
create policy perf_reviews_i on public.perf_reviews for insert with check (core.has_role(org_id, array['hr']::core.app_role[]));
create policy perf_reviews_u on public.perf_reviews for update using (core.has_role(org_id, array['hr']::core.app_role[])) with check (core.has_role(org_id, array['hr']::core.app_role[]));
create policy perf_reviews_d on public.perf_reviews for delete using (core.has_role(org_id, array['hr']::core.app_role[]));
create policy shifts_r on public.shifts for select using (core.has_role(org_id, array['owner','org_admin','hr','operations','payroll']::core.app_role[]));
create policy shifts_i on public.shifts for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy shifts_u on public.shifts for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy shifts_d on public.shifts for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy advances_r on public.advances for select using (core.has_role(org_id, array['owner','org_admin','hr','finance','payroll']::core.app_role[]));
create policy advances_i on public.advances for insert with check (core.has_role(org_id, array['owner','org_admin','hr','finance']::core.app_role[]));
create policy advances_u on public.advances for update using (core.has_role(org_id, array['owner','org_admin','hr','finance']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr','finance']::core.app_role[]));
create policy advances_d on public.advances for delete using (core.has_role(org_id, array['owner','org_admin','hr','finance']::core.app_role[]));
create policy checklists_r on public.checklists for select using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy checklists_i on public.checklists for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy checklists_u on public.checklists for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy checklists_d on public.checklists for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy payroll_runs_r on public.payroll_runs for select using (core.has_role(org_id, array['payroll']::core.app_role[]));
create policy payroll_runs_i on public.payroll_runs for insert with check (core.has_role(org_id, array['payroll']::core.app_role[]));
create policy payroll_runs_u on public.payroll_runs for update using (core.has_role(org_id, array['payroll']::core.app_role[])) with check (core.has_role(org_id, array['payroll']::core.app_role[]));
create policy payroll_runs_d on public.payroll_runs for delete using (core.has_role(org_id, array['payroll']::core.app_role[]));
create policy import_batches_r on public.import_batches for select using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy import_batches_i on public.import_batches for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy import_batches_u on public.import_batches for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy import_batches_d on public.import_batches for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy jobs_r on public.jobs for select using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy jobs_i on public.jobs for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy jobs_u on public.jobs for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy jobs_d on public.jobs for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy candidates_r on public.candidates for select using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy candidates_i on public.candidates for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy candidates_u on public.candidates for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy candidates_d on public.candidates for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy interviews_r on public.interviews for select using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy interviews_i on public.interviews for insert with check (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy interviews_u on public.interviews for update using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy interviews_d on public.interviews for delete using (core.has_role(org_id, array['owner','org_admin','hr','operations']::core.app_role[]));
create policy offers_r on public.offers for select using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy offers_i on public.offers for insert with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy offers_u on public.offers for update using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy offers_d on public.offers for delete using (core.has_role(org_id, array['owner','org_admin','hr']::core.app_role[]));
create policy client_requests_r on public.client_requests for select using ((core.can_see_brand(org_id, brand_id)));
create policy client_requests_i on public.client_requests for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy client_requests_u on public.client_requests for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy client_requests_d on public.client_requests for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy client_requests_ci on public.client_requests for insert with check (core.has_role(org_id, array['client_admin']::core.app_role[]) and core.can_see_brand(org_id, brand_id));   -- müşteri: yalnızca kendi markasına EKLEME
create policy surveys_r_m5 on public.surveys for select using ((core.can_see_brand(org_id, brand_id) or (brand_id is null and org_id in (select core.my_orgs()))));
create policy surveys_i_m5 on public.surveys for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy surveys_u_m5 on public.surveys for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy surveys_d_m5 on public.surveys for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','hr']::core.app_role[]));
create policy survey_responses_r_m5 on public.survey_responses for select using ((core.can_see_brand(org_id, brand_id)));
create policy survey_responses_i_m5 on public.survey_responses for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy survey_responses_u_m5 on public.survey_responses for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy survey_responses_d_m5 on public.survey_responses for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy survey_responses_ci_m5 on public.survey_responses for insert with check (core.has_role(org_id, array['client_admin','client_viewer']::core.app_role[]) and core.can_see_brand(org_id, brand_id));   -- müşteri: yalnızca kendi markasına EKLEME
create policy media_assets_r on public.media_assets for select using ((core.can_see_brand(org_id, brand_id) and (core.is_internal(org_id) or coalesce((data ->> 'client_visible')::boolean, false))));
create policy media_assets_i on public.media_assets for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy media_assets_u on public.media_assets for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy media_assets_d on public.media_assets for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy review_comments_r on public.review_comments for select using ((core.can_see_brand(org_id, brand_id) and (core.is_internal(org_id) or coalesce((data ->> 'client_visible')::boolean, false))));
create policy review_comments_i on public.review_comments for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy review_comments_u on public.review_comments for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy review_comments_d on public.review_comments for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy review_comments_ci on public.review_comments for insert with check (core.has_role(org_id, array['client_admin','client_viewer']::core.app_role[]) and core.can_see_brand(org_id, brand_id));   -- müşteri: yalnızca kendi markasına EKLEME
create policy share_links_r on public.share_links for select using ((core.can_see_brand(org_id, brand_id) and (core.is_internal(org_id) or coalesce((data ->> 'client_visible')::boolean, false))));
create policy share_links_i on public.share_links for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]));
create policy share_links_u on public.share_links for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]));
create policy share_links_d on public.share_links for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]));
create policy transfers_r on public.transfers for select using (core.is_internal(org_id));
create policy transfers_i on public.transfers for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]));
create policy transfers_u on public.transfers for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]));
create policy transfers_d on public.transfers for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative','freelancer']::core.app_role[]));
create policy studio_items_r on public.studio_items for select using (core.is_internal(org_id));
create policy studio_items_i on public.studio_items for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy studio_items_u on public.studio_items for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy studio_items_d on public.studio_items for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy social_posts_r on public.social_posts for select using ((core.can_see_brand(org_id, brand_id) and (core.is_internal(org_id) or coalesce((data ->> 'client_visible')::boolean, false))));
create policy social_posts_i on public.social_posts for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy social_posts_u on public.social_posts for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy social_posts_d on public.social_posts for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy decks_r on public.decks for select using (core.is_internal(org_id));
create policy decks_i on public.decks for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy decks_u on public.decks for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy decks_d on public.decks for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy campaigns_r on public.campaigns for select using (core.is_internal(org_id));
create policy campaigns_i on public.campaigns for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy campaigns_u on public.campaigns for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy campaigns_d on public.campaigns for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy segments_r on public.segments for select using (core.is_internal(org_id));
create policy segments_i on public.segments for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy segments_u on public.segments for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy segments_d on public.segments for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy newsletters_r on public.newsletters for select using (core.is_internal(org_id));
create policy newsletters_i on public.newsletters for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy newsletters_u on public.newsletters for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy newsletters_d on public.newsletters for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy mkt_leads_r on public.mkt_leads for select using (core.is_internal(org_id));
create policy mkt_leads_i on public.mkt_leads for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy mkt_leads_u on public.mkt_leads for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy mkt_leads_d on public.mkt_leads for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy event_items_r on public.event_items for select using (core.is_internal(org_id));
create policy event_items_i on public.event_items for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy event_items_u on public.event_items for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy event_items_d on public.event_items for delete using (core.has_role(org_id, array['owner','org_admin','operations','account','pm','creative']::core.app_role[]));
create policy automations_r on public.automations for select using (core.has_role(org_id, array['owner','org_admin','operations','integration_admin','auditor']::core.app_role[]));
create policy automations_i on public.automations for insert with check (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[]));
create policy automations_u on public.automations for update using (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[]));
create policy automations_d on public.automations for delete using (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[]));
create policy automation_runs_r on public.automation_runs for select using (core.has_role(org_id, array['owner','org_admin','operations','integration_admin','auditor']::core.app_role[]));
create policy automation_runs_i on public.automation_runs for insert with check (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[]));
create policy automation_runs_u on public.automation_runs for update using (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[]));
create policy automation_runs_d on public.automation_runs for delete using (core.has_role(org_id, array['owner','org_admin','operations','integration_admin']::core.app_role[]));

-- Mevcut tablolar için ek politikalar
create policy time_u on public.time_entries for update using (employee_id = core.me()) with check (employee_id = core.me());   -- kendi zamanlayıcısını durdurur

-- Yeni kullanıcı kayıtları (başvuru formu, anon): yalnızca AÇIK pozisyon + aşama=applied
create policy jobs_apply_r on public.jobs for select to anon using (data ->> 'status' = 'open');
create policy cand_apply_i on public.candidates for insert to anon with check (data ->> 'stage' = 'applied' and data ->> 'source' = 'apply' and exists (select 1 from public.jobs j where j.id::text = data ->> 'job_id' and j.org_id = candidates.org_id and j.data ->> 'status' = 'open'));
grant insert on public.candidates to anon; grant select on public.jobs to anon;

-- İK denetim kayıtları: İK rolü yalnızca hr_* kaynaklarını görür (özlük arşivi erişim logu)
create policy audit_hr_r on public.audit_events for select using (core.has_role(org_id, array['hr']::core.app_role[]) and (action like 'hr%' or resource like 'hr%'));

-- Teklif kabulü → çalışan + hr_profile + onboarding checklist + ilk görev (tek işlem). Yetki: owner/org_admin/hr.
create or replace function public.hire_candidate(p_candidate uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c record; o record; v_org uuid; v_emp uuid; v_code text; v_start date; v_proj uuid;
begin
  select * into c from public.candidates where id = p_candidate;
  if not found then raise exception 'aday yok' using errcode = 'P0002'; end if;
  v_org := c.org_id;
  if not core.has_role(v_org, array['owner','org_admin','hr']::core.app_role[]) then raise exception 'yetki yok' using errcode = '42501'; end if;
  select * into o from public.offers where org_id = v_org and data ->> 'candidate_id' = p_candidate::text order by created_at desc limit 1;
  if not found or c.data ->> 'stage' = 'hired' then raise exception 'teklif yok veya aday zaten işe alındı' using errcode = '42501'; end if;
  v_start := coalesce((o.data ->> 'start_date')::date, current_date);
  v_code := upper(left(regexp_replace(c.data ->> 'name', '[^[:alpha:]]', '', 'g'), 3));
  insert into public.employees (org_id, code, name, role_title, app_role, weekly_hours)
    values (v_org, v_code, c.data ->> 'name', coalesce(o.data ->> 'role_title', ''), coalesce((o.data ->> 'app_role')::core.app_role, 'creative'), 40) returning id into v_emp;
  insert into public.hr_profiles (org_id, data) values (v_org, jsonb_build_object('employee_id', v_emp, 'dept', 'Kreatif', 'manager', '', 'start_date', v_start, 'end_date', null, 'status', 'active', 'employment', 'full', 'phone', '', 'email', c.data ->> 'email', 'leave_total', 14));
  insert into public.checklists (org_id, data)
    select v_org, jsonb_build_object('employee_id', v_emp, 'flow', 'onboarding', 'title', t.title, 'done', false, 'due', v_start + t.d, 'owner', '')
    from (values ('Sözleşme ve özlük evraklarını topla', 0), ('Zimmet hazırla', 1), ('Erişimleri aç', 2), ('İlk hafta orientation planı', 3), ('İlk görev: projeyi incele ve sunum yap', 5)) as t(title, d);
  select id into v_proj from public.projects where org_id = v_org and status = 'active' order by due_at limit 1;
  if v_proj is not null then
    insert into public.tasks (org_id, project_id, title, assignee_id, state, priority, due_at, planned_minutes, task_type, qty, source_ref)
      values (v_org, v_proj, 'İlk görev · ' || (c.data ->> 'name') || ': projeyi incele ve sunum yap', v_emp, 'brief', 'normal', v_start + 5, 240, 'general', 1, 'candidate:' || p_candidate::text);
  end if;
  update public.candidates set data = data || jsonb_build_object('stage', 'hired', 'employee_id', v_emp) where id = p_candidate;
  update public.offers set data = data || '{"status":"accepted"}'::jsonb where id = o.id;
  insert into public.audit_events (org_id, actor, action, resource, meta) values (v_org, auth.uid(), 'hire.offer_accepted', 'candidates/' || p_candidate::text, jsonb_build_object('employee', v_emp));
  return jsonb_build_object('employee_id', v_emp);
end $$;
revoke all on function public.hire_candidate(uuid) from public, anon; grant execute on function public.hire_candidate(uuid) to authenticated;

-- Client Admin toplu onayı: kendi markasının "review" durumundaki client_visible postlarını approved yapar
create or replace function public.approve_social_batch(p_brand uuid) returns int language plpgsql security definer set search_path = public as $$
declare v_org uuid; n int;
begin
  select org_id into v_org from public.brands where id = p_brand;
  if v_org is null or not core.has_role(v_org, array['client_admin']::core.app_role[]) or not core.can_see_brand(v_org, p_brand) then raise exception 'yetki yok' using errcode = '42501'; end if;
  update public.social_posts set data = data || '{"status":"approved"}'::jsonb
    where brand_id = p_brand and data ->> 'status' = 'review' and coalesce((data ->> 'client_visible')::boolean, false);
  get diagnostics n = row_count;
  insert into public.audit_events (org_id, actor, action, resource, meta) values (v_org, auth.uid(), 'social.batch_approved', 'brands/' || p_brand::text, jsonb_build_object('count', n));
  return n;
end $$;
revoke all on function public.approve_social_batch(uuid) from public, anon; grant execute on function public.approve_social_batch(uuid) to authenticated;
