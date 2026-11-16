-- JS Ecosystem · 0018 Ekip içi bağımlılık, yetki ve onay mekanizmaları
-- A) task_links + core.task_blocked + aşama koruması + task.unblocked olayı/bildirimi
-- B) delegations (geçici yetki devri); yetki matrisi organizations.settings.permissions (jsonb) içinde yaşar — şema değişikliği yok
-- C) approval_policies / approval_steps, approvals.policy_id / current_step, yeni action_type'lar, zincir adımına göre karar RLS'i
-- Tablolar COLLECTIONS biçimindedir (id, org_id, native kolonlar, data jsonb, created_at). İdempotent (tekrar çalıştırılabilir). 0017 gerektirir.

/* ───────── A) Görev bağımlılıkları ───────── */
create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_task_id uuid not null references public.tasks(id) on delete cascade,
  to_task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null default 'blocks' check (kind in ('blocks','relates','duplicates')),
  created_by uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (from_task_id, to_task_id, kind),
  check (from_task_id <> to_task_id)
);
create index if not exists task_links_to_idx on public.task_links (to_task_id, kind);
create index if not exists task_links_from_idx on public.task_links (from_task_id, kind);
alter table public.task_links enable row level security;
drop policy if exists task_links_r on public.task_links;
create policy task_links_r on public.task_links for select using (core.is_internal(org_id));
drop policy if exists task_links_w on public.task_links;
create policy task_links_w on public.task_links for all
  using (core.can_write_task(org_id, from_task_id) or core.can_write_task(org_id, to_task_id))
  with check (core.can_write_task(org_id, from_task_id) or core.can_write_task(org_id, to_task_id));

-- Engelli mi: 'blocks' bağıyla gelen ve teslim/arşivde olmayan öncül var mı?
create or replace function core.task_blocked(p_task uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.task_links l join public.tasks t on t.id = l.from_task_id
    where l.to_task_id = p_task and l.kind = 'blocks' and t.state not in ('delivery','archive'))
$$;
create or replace function core.task_blockers(p_task uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.task_links l join public.tasks t on t.id = l.from_task_id
  where l.to_task_id = p_task and l.kind = 'blocks' and t.state not in ('delivery','archive')
$$;

-- Aşama koruması: engelli görev production ve sonrasına taşınamaz; owner/org_admin/pm (ve servis rolü) geçebilir.
-- settings.workflow.enforce_dependencies = false ise kapalı (varsayılan açık).
create or replace function core.guard_task_dependencies() returns trigger language plpgsql security definer set search_path = public as $$
declare v_enforce boolean; v_role core.app_role;
begin
  if new.state is not distinct from old.state then return new; end if;
  if new.state not in ('production','internal_review','approval','delivery','archive') then return new; end if;
  select coalesce((settings -> 'workflow' ->> 'enforce_dependencies')::boolean, true) into v_enforce from public.organizations where id = new.org_id;
  if not coalesce(v_enforce, true) then return new; end if;
  if coalesce(auth.role(), 'service_role') = 'service_role' then return new; end if;
  if not core.task_blocked(new.id) then return new; end if;
  v_role := core.role(new.org_id);
  if v_role in ('owner','org_admin','pm') then return new; end if;
  raise exception 'Görev engelli: önce bağımlı olduğu görevler teslim edilmeli (% açık engel)', core.task_blockers(new.id) using errcode = '42501';
end $$;
drop trigger if exists tasks_guard_dependencies on public.tasks;
create trigger tasks_guard_dependencies before update of state on public.tasks for each row execute function core.guard_task_dependencies();

-- Son engel kalkınca: events(task.unblocked) + sorumluya bildirim (notifications.data).
create or replace function core.emit_task_unblocked() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; v_title text;
begin
  if new.state not in ('delivery','archive') or old.state in ('delivery','archive') then return new; end if;
  for r in select t.id, t.org_id, t.assignee_id, t.project_id, t.title from public.task_links l join public.tasks t on t.id = l.to_task_id
           where l.from_task_id = new.id and l.kind = 'blocks' and not core.task_blocked(t.id) loop
    insert into public.events (org_id, type, aggregate, aggregate_id, payload)
    values (r.org_id, 'task.unblocked', 'tasks', r.id, jsonb_build_object('new', jsonb_build_object('id', r.id, 'title', r.title, 'project_id', r.project_id, 'assignee_id', r.assignee_id, 'unblocked_by', new.id)));
    if r.assignee_id is not null then
      insert into public.notifications (org_id, data) values (r.org_id, jsonb_build_object(
        'employee_id', r.assignee_id, 'kind', 'unblocked', 'title', 'Önün açıldı: ' || r.title, 'body', '"' || new.title || '" tamamlandı; bu görev artık engelli değil.',
        'read', false, 'href', '/app/projects/' || r.project_id || '?task=' || r.id));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists tasks_emit_unblocked on public.tasks;
create trigger tasks_emit_unblocked after update of state on public.tasks for each row execute function core.emit_task_unblocked();

/* ───────── B) Delegasyon ───────── */
create table if not exists public.delegations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_employee_id uuid not null references public.employees(id) on delete cascade,
  to_employee_id uuid not null references public.employees(id) on delete cascade,
  caps text[] not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reason text not null default '',
  status text not null default 'active' check (status in ('pending','active','revoked')),
  data jsonb not null default '{}'::jsonb,            -- {created_by, approval_id}
  created_at timestamptz not null default now(),
  check (from_employee_id <> to_employee_id), check (ends_at > starts_at)
);
create index if not exists delegations_to_idx on public.delegations (org_id, to_employee_id, status, ends_at);
alter table public.delegations enable row level security;
drop policy if exists delegations_r on public.delegations;
create policy delegations_r on public.delegations for select using (core.is_internal(org_id));
-- Self-servis: kişi kendi adına (from = me) açar; owner/org_admin herkes adına. Durum geçişleri uygulama katmanında (pending → onay).
drop policy if exists delegations_i on public.delegations;
create policy delegations_i on public.delegations for insert with check (core.is_internal(org_id) and (from_employee_id = core.me() or core.has_role(org_id, array['owner','org_admin']::core.app_role[])));
drop policy if exists delegations_u on public.delegations;
create policy delegations_u on public.delegations for update using (from_employee_id = core.me() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]))
  with check (from_employee_id = core.me() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
drop policy if exists delegations_d on public.delegations;
create policy delegations_d on public.delegations for delete using (from_employee_id = core.me() or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
-- Bana aktif delegasyonla gelen yetki var mı? ('*' tümü)
create or replace function core.delegated(p_org uuid, p_cap text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.delegations d where d.org_id = p_org and d.to_employee_id = core.me() and d.status = 'active'
                 and d.starts_at <= now() and d.ends_at > now() and (p_cap = any(d.caps) or '*' = any(d.caps)))
$$;

/* ───────── C) Onay zincirleri ───────── */
create table if not exists public.approval_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  action_type text not null,
  condition jsonb not null default '{}'::jsonb,       -- {min_amount_minor?, brand_ids?, brand_status?, task_types?, labels?, to_states?}
  steps jsonb not null default '[]'::jsonb,           -- [{role|employee_id|manager_of_requester, mode any|all, sla_hours}]
  escalation jsonb,                                   -- {after_hours, to_role|to_employee_id} | null
  active boolean not null default true,
  data jsonb not null default '{}'::jsonb,            -- {name}
  created_at timestamptz not null default now()
);
create unique index if not exists approval_policies_name_uq on public.approval_policies (org_id, (data ->> 'name'));
create index if not exists approval_policies_org_idx on public.approval_policies (org_id, action_type, active);
alter table public.approval_policies enable row level security;
drop policy if exists approval_policies_r on public.approval_policies;
create policy approval_policies_r on public.approval_policies for select using (core.is_internal(org_id));
drop policy if exists approval_policies_w on public.approval_policies;
create policy approval_policies_w on public.approval_policies for all
  using (core.has_role(org_id, array['owner','org_admin']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

alter table public.approvals add column if not exists policy_id uuid references public.approval_policies(id) on delete set null;
alter table public.approvals add column if not exists current_step int;
alter table public.approvals drop constraint if exists approvals_action_type_check;
alter table public.approvals add constraint approvals_action_type_check check (action_type in ('content','budget','scope','client_decision','access','agent','task_stage','request_convert','announcement_post'));

create table if not exists public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  approval_id uuid not null references public.approvals(id) on delete cascade,
  step_index int not null default 0,
  approver_role core.app_role,
  status text not null default 'pending' check (status in ('pending','approved','rejected','skipped')),
  decided_by uuid, decided_at timestamptz, note text, due_at timestamptz,
  data jsonb not null default '{}'::jsonb,            -- {approvers[], mode, decisions[], started_at, escalated_at, escalated_to[]}
  created_at timestamptz not null default now(),
  unique (approval_id, step_index)
);
create index if not exists approval_steps_approval_idx on public.approval_steps (approval_id, step_index);
create index if not exists approval_steps_due_idx on public.approval_steps (org_id, status, due_at);
alter table public.approval_steps enable row level security;

-- Bu adımda karar verebilir miyim? rol ∥ kişi listesi ∥ yükseltme hedefi ∥ delegasyon (approvals.decide) — uygulamadaki canDecideStep ile aynı kural.
create or replace function core.can_decide_step(p_step uuid) returns boolean language plpgsql stable security definer set search_path = public as $$
declare s record; v_role core.app_role; v_me uuid; v_appr text[]; v_esc text[]; v_from record;
begin
  select * into s from public.approval_steps where id = p_step;
  if not found or s.status <> 'pending' then return false; end if;
  v_role := core.role(s.org_id); v_me := core.me();
  v_appr := coalesce(array(select jsonb_array_elements_text(s.data -> 'approvers')), '{}');
  v_esc := coalesce(array(select jsonb_array_elements_text(s.data -> 'escalated_to')), '{}');
  if v_me is not null and (v_me::text = any(v_appr) or v_me::text = any(v_esc)) then return true; end if;
  if ('role:' || v_role::text) = any(v_esc) then return true; end if;
  if v_role = 'owner' then return true; end if;
  if s.approver_role is not null and cardinality(v_appr) = 0 then
    if v_role = 'org_admin' and s.approver_role <> 'owner' then return true; end if;
    if v_role = s.approver_role then return true; end if;
    if s.approver_role = 'pm' and v_role in ('operations','account') then return true; end if;
    if s.approver_role = 'account' and v_role = 'operations' then return true; end if;
  end if;
  -- Delegasyon: bana approvals.decide devreden kişi bu adımda karar verebiliyorsa
  for v_from in select e.id, e.app_role from public.delegations d join public.employees e on e.id = d.from_employee_id
                where d.org_id = s.org_id and d.to_employee_id = v_me and d.status = 'active' and d.starts_at <= now() and d.ends_at > now()
                  and ('approvals.decide' = any(d.caps) or '*' = any(d.caps)) loop
    if v_from.id::text = any(v_appr) or v_from.id::text = any(v_esc) then return true; end if;
    if s.approver_role is not null and cardinality(v_appr) = 0 and (v_from.app_role = s.approver_role or v_from.app_role = 'owner'
       or (v_from.app_role = 'org_admin' and s.approver_role <> 'owner') or (s.approver_role = 'pm' and v_from.app_role in ('operations','account')) or (s.approver_role = 'account' and v_from.app_role = 'operations')) then return true; end if;
  end loop;
  return false;
end $$;
create or replace function core.can_decide_approval(p_approval uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approval_steps s where s.approval_id = p_approval and s.status = 'pending' and core.can_decide_step(s.id))
$$;
-- Bu onayda bir adımı ben karara bağladım mı? (security definer: approvals ↔ approval_steps politika döngüsünü kırar)
create or replace function core.decided_step(p_approval uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approval_steps s where s.approval_id = p_approval and s.decided_by = core.me())
$$;

drop policy if exists approval_steps_r on public.approval_steps;
create policy approval_steps_r on public.approval_steps for select using (core.is_internal(org_id) or exists (select 1 from public.approvals a where a.id = approval_id and a.required_role in ('client_admin','client_viewer') and core.can_see_brand(a.org_id, nullif(a.subject ->> 'brand_id','')::uuid)));
drop policy if exists approval_steps_i on public.approval_steps;
create policy approval_steps_i on public.approval_steps for insert with check (core.is_internal(org_id));
-- Karar veren, zincirin tüm adımlarını (sonrakini başlatma, kalanları atlama) güncelleyebilir: uygulama önce diğer adımları, en son karar adımını yazar.
drop policy if exists approval_steps_u on public.approval_steps;
create policy approval_steps_u on public.approval_steps for update using (core.can_decide_approval(approval_id) or core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

-- approvals: eski kural ∨ zincir adımı kararı (zincirli onaylarda required_role ilk adımın rolüdür; sonraki adımların rolleri de güncelleyebilmeli).
drop policy if exists appr_u on public.approvals;
create policy appr_u on public.approvals for update using (
  core.role(org_id) = required_role or core.has_role(org_id, array['owner']::core.app_role[])
  or (core.has_role(org_id, array['org_admin']::core.app_role[]) and required_role <> 'owner')
  or (required_role = 'pm' and core.has_role(org_id, array['operations','account']::core.app_role[]))
  or core.can_decide_approval(id)
  or core.decided_step(id)   -- karar veren yan etki sonucunu (subject.effect) yazabilir
  or (status = 'approved' and requested_by = core.me()));

/* ───────── Varsayılan onay politikaları (org 'jobs') ───────── */
insert into public.approval_policies (org_id, action_type, condition, steps, escalation, active, data)
select o.id, p.action_type, p.condition, p.steps, p.escalation, true, jsonb_build_object('name', p.name)
from public.organizations o,
 (values
  ('Bütçe > ₺25.000', 'budget', '{"min_amount_minor":2500000}'::jsonb, '[{"manager_of_requester":true,"mode":"any","sla_hours":24},{"role":"finance","mode":"any","sla_hours":48},{"role":"owner","mode":"any","sla_hours":48}]'::jsonb, '{"after_hours":24,"to_role":"owner"}'::jsonb),
  ('Müşteri kararı', 'client_decision', '{}'::jsonb, '[{"role":"account","mode":"any","sla_hours":24},{"role":"owner","mode":"any","sla_hours":72}]'::jsonb, '{"after_hours":48,"to_role":"owner"}'::jsonb),
  ('Kapsam değişikliği', 'scope', '{}'::jsonb, '[{"role":"pm","mode":"any","sla_hours":24},{"role":"owner","mode":"any","sla_hours":48}]'::jsonb, '{"after_hours":24,"to_role":"owner"}'::jsonb),
  ('Ajan uygulama', 'agent', '{}'::jsonb, '[{"role":"owner","mode":"any","sla_hours":72}]'::jsonb, null::jsonb),
  ('Riskli marka teslimi', 'task_stage', '{"brand_status":["risky"],"to_states":["delivery"]}'::jsonb, '[{"role":"account","mode":"any","sla_hours":24}]'::jsonb, '{"after_hours":24,"to_role":"owner"}'::jsonb)
 ) as p(name, action_type, condition, steps, escalation)
where o.slug = 'jobs'
on conflict do nothing;

/* ───────── Erişim + Realtime ───────── */
grant select, insert, update, delete on public.task_links, public.delegations, public.approval_policies, public.approval_steps to authenticated, service_role;
grant execute on function core.task_blocked(uuid), core.task_blockers(uuid), core.delegated(uuid, text), core.can_decide_step(uuid), core.can_decide_approval(uuid), core.decided_step(uuid) to authenticated, service_role;
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['task_links','approval_steps','delegations'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
