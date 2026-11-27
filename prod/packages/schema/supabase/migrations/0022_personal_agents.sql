-- JS Ecosystem · 0022 personal agents — kişisel ajan filosu, talimat sürümleri, onay kapısı (Agency OS Faz 3). 0021 gerektirir; idempotent.
-- Erişim satır düzeyindedir: üye yalnızca kendi ajanlarını, ekip lideri kendisine (dolaylı) bağlı çalışanların ajanlarını, owner / org_admin hepsini görür ve yönetir.
-- Hiçbir talimat sürümü onaysız yürürlüğe girmez: sürüm 'draft' olarak eklenir; 'active' yapıldığında tetikleyici önceki yürürlükteki sürümü 'superseded' yapar
-- ve personal_agents.current_version'ı günceller. Sürüm içeriği (data) ve numarası sonradan değiştirilemez.

/* ───────── 1) Denetim zinciri: p_emp, çağıranın kendisi mi / zincirinde mi? ───────── */
create or replace function core.supervises(p_org uuid, p_emp uuid) returns boolean language sql stable security definer set search_path = public as
$$ select core.has_role(p_org, array['owner','org_admin']::core.app_role[])
       or (core.me() is not null and (p_emp = core.me() or exists (
            with recursive up(id, manager_id, depth) as (
              select e.id, e.manager_id, 1 from public.employees e where e.id = p_emp and e.org_id = p_org
              union all
              select m.id, m.manager_id, up.depth + 1 from public.employees m join up on m.id = up.manager_id where up.depth < 12
            )
            select 1 from up where manager_id = core.me()))) $$;

/* ───────── 2) Kişisel ajanlar ───────── */
create table if not exists public.personal_agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  owner_employee_id uuid not null references public.employees(id) on delete cascade,
  base_role text,                                      -- isteğe bağlı Agency rol kimliği (ör. 'testing-reality-checker')
  status text not null default 'active' check (status in ('active','paused','archived')),
  current_version int not null default 0 check (current_version >= 0),   -- 0 = onaylı sürüm yok
  data jsonb not null default '{}'::jsonb,             -- {name, specialty}
  created_at timestamptz not null default now()
);
create index if not exists personal_agents_owner_idx on public.personal_agents (org_id, owner_employee_id);
alter table public.personal_agents enable row level security;
drop policy if exists personal_agents_r on public.personal_agents;
create policy personal_agents_r on public.personal_agents for select using (core.is_internal(org_id) and core.supervises(org_id, owner_employee_id));
drop policy if exists personal_agents_i on public.personal_agents;
create policy personal_agents_i on public.personal_agents for insert with check (core.is_internal(org_id) and core.supervises(org_id, owner_employee_id) and current_version = 0);
drop policy if exists personal_agents_u on public.personal_agents;
create policy personal_agents_u on public.personal_agents for update using (core.is_internal(org_id) and core.supervises(org_id, owner_employee_id))
  with check (core.is_internal(org_id) and core.supervises(org_id, owner_employee_id));
drop policy if exists personal_agents_d on public.personal_agents;
create policy personal_agents_d on public.personal_agents for delete using (core.is_internal(org_id) and core.supervises(org_id, owner_employee_id));

/* ───────── 3) Talimat sürümleri ───────── */
create table if not exists public.agent_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.personal_agents(id) on delete cascade,
  version int not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft','active','superseded','rejected')),
  author text not null default 'user' check (author in ('user','agent')),   -- 'agent' = ajanın kendi önerdiği güncelleme
  created_by uuid references public.employees(id) on delete set null,
  decided_by uuid references public.employees(id) on delete set null,
  decided_at timestamptz,
  data jsonb not null default '{}'::jsonb,             -- {instructions, can[], cannot[], change_note}
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);
create index if not exists agent_versions_agent_idx on public.agent_versions (agent_id, version desc);
create unique index if not exists agent_versions_one_active on public.agent_versions (agent_id) where status = 'active';
alter table public.agent_versions enable row level security;
create or replace function core.can_manage_agent(p_agent uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.personal_agents a where a.id = p_agent and core.is_internal(a.org_id) and core.supervises(a.org_id, a.owner_employee_id)) $$;
drop policy if exists agent_versions_r on public.agent_versions;
create policy agent_versions_r on public.agent_versions for select using (core.can_manage_agent(agent_id));
drop policy if exists agent_versions_i on public.agent_versions;
create policy agent_versions_i on public.agent_versions for insert with check (core.can_manage_agent(agent_id) and status = 'draft' and decided_by is null and decided_at is null);
drop policy if exists agent_versions_u on public.agent_versions;
create policy agent_versions_u on public.agent_versions for update using (core.can_manage_agent(agent_id)) with check (core.can_manage_agent(agent_id));
-- Silme yok: sürüm geçmişi korunur (ajan silinince zincirleme silinir).

/* ───────── 4) Sürüm bütünlüğü: içerik değişmez, geçişler sınırlı, tek yürürlükte sürüm ───────── */
create or replace function core.agent_version_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.agent_id <> old.agent_id or new.version <> old.version or new.org_id <> old.org_id or new.author <> old.author or new.data is distinct from old.data then
    raise exception 'Sürüm içeriği değiştirilemez; yeni bir sürüm oluştur' using errcode = '42501';
  end if;
  if new.status <> old.status and not ((old.status = 'draft' and new.status in ('active','rejected')) or (old.status = 'active' and new.status = 'superseded')) then
    raise exception 'Geçersiz sürüm durumu geçişi: % → %', old.status, new.status using errcode = '42501';
  end if;
  if new.status = 'active' and old.status = 'draft' then
    -- Önce eski yürürlükteki sürümü kapat (tekil indeks: ajan başına bir 'active').
    update public.agent_versions set status = 'superseded' where agent_id = new.agent_id and status = 'active' and id <> new.id;
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, core.me());
  elsif new.status = 'rejected' and old.status = 'draft' then
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, core.me());
  end if;
  return new;
end $$;
drop trigger if exists agent_version_guard on public.agent_versions;
create trigger agent_version_guard before update on public.agent_versions for each row execute function core.agent_version_guard();

create or replace function core.agent_version_activated() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    update public.personal_agents set current_version = new.version where id = new.agent_id;
  end if;
  return null;
end $$;
drop trigger if exists agent_version_activated on public.agent_versions;
create trigger agent_version_activated after update on public.agent_versions for each row execute function core.agent_version_activated();

-- current_version yalnızca tetikleyiciyle değişir (istemci elle yükseltemez).
create or replace function core.personal_agent_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id <> old.org_id then raise exception 'Ajan başka kuruma taşınamaz' using errcode = '42501'; end if;
  if new.current_version <> old.current_version and pg_trigger_depth() < 2
     and not exists (select 1 from public.agent_versions v where v.agent_id = new.id and v.version = new.current_version and v.status = 'active') then
    raise exception 'Yürürlükteki sürüm yalnızca onaylanan sürümle değişir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists personal_agent_guard on public.personal_agents;
create trigger personal_agent_guard before update on public.personal_agents for each row execute function core.personal_agent_guard();

/* ───────── 5) Erişim ───────── */
grant select, insert, update, delete on public.personal_agents to authenticated, service_role;
grant select, insert, update on public.agent_versions to authenticated, service_role;
grant execute on function core.supervises(uuid, uuid), core.can_manage_agent(uuid) to authenticated, service_role;
