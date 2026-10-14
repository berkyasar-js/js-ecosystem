-- JS Ecosystem · 0006 gaps: API anahtarı alanları, ihale (twins.bids) + atama + onay kapısı, olay işleme (otomasyon dispatcher)
-- Not: tüm tablolar `public` altındadır (PostgREST şeması); "core.api_tokens" = public.access_tokens (genişletildi), "twins.bids" = public.twin_bids.

/* ───────── 1) Olaylar: dispatcher işaretçisi (0003'te var; idempotent) ───────── */
alter table public.events add column if not exists processed_at timestamptz;
create index if not exists events_unprocessed_idx on public.events (occurred_at) where processed_at is null;

/* ───────── 2) API anahtarları (public.access_tokens): kullanıcı + son kullanma ───────── */
alter table public.access_tokens add column if not exists user_id uuid default auth.uid();
alter table public.access_tokens add column if not exists expires_at timestamptz;
update public.access_tokens set user_id = created_by where user_id is null;
-- 0003'teki sütun-seviyesi revoke, tablo-seviyesi grant varken etkisizdi: token_hash'i istemci rollerinden gerçekten gizle.
revoke select on public.access_tokens from authenticated, anon;
grant select (id, org_id, name, token_prefix, scopes, created_by, user_id, created_at, last_used_at, expires_at, revoked_at) on public.access_tokens to authenticated;

/* ───────── 3) İhale: twin_bids + task_assignments ───────── */
create table public.twin_bids (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  twin_id uuid not null references public.employee_twins(id) on delete cascade,
  employee_id uuid references public.employees(id),
  confidence int not null check (confidence between 0 and 100),
  eta_hours numeric(7,1) not null check (eta_hours > 0),
  rationale text not null default '',
  status text not null default 'open' check (status in ('open','won','lost','withdrawn')),
  created_at timestamptz not null default now(), decided_at timestamptz
);
create index on public.twin_bids (task_id, status);
create index on public.twin_bids (org_id, created_at desc);
create unique index twin_bids_one_open on public.twin_bids (task_id, twin_id) where status = 'open';

create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  bid_id uuid references public.twin_bids(id) on delete set null,
  assigned_by uuid,
  created_at timestamptz not null default now()
);
create index on public.task_assignments (task_id);
create index on public.task_assignments (org_id, created_at desc);

alter table public.twin_bids enable row level security;
alter table public.task_assignments enable row level security;
create policy tb_r on public.twin_bids for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy tb_i on public.twin_bids for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy tb_u on public.twin_bids for update using (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[])) with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy tb_d on public.twin_bids for delete using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));
create policy ta_r on public.task_assignments for select using (org_id in (select core.my_orgs()) and core.is_internal(org_id));
create policy ta_i on public.task_assignments for insert with check (core.has_role(org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]));
create policy ta_d on public.task_assignments for delete using (core.has_role(org_id, array['owner','org_admin']::core.app_role[]));

/* ───────── 4) Olay üretimi: otomasyon tetikleyicileri için ek tablolar (core.emit_event genel) ───────── */
create trigger twin_bids_emit        after insert or update on public.twin_bids        for each row execute function core.emit_event();
create trigger task_assignments_emit after insert          on public.task_assignments for each row execute function core.emit_event();
create trigger allocations_emit      after insert or update on public.allocations      for each row execute function core.emit_event();
create trigger leaves_emit           after insert or update on public.leaves           for each row execute function core.emit_event();
create trigger candidates_emit       after insert or update on public.candidates       for each row execute function core.emit_event();
create trigger crm_deals_emit        after insert or update on public.crm_deals        for each row execute function core.emit_event();

/* ───────── 5) Atama: yüksek öncelikte onay kapısı ───────── */
-- İç fonksiyon: ataması yapar, teklifi 'won', diğer açıkları 'lost' yapar. İstemci rollerine kapalı.
create or replace function public.finalize_bid(p_bid uuid, p_by uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare b record; v_as uuid;
begin
  select * into b from public.twin_bids where id = p_bid for update;
  if not found or b.status <> 'open' or b.employee_id is null then raise exception 'teklif uygun değil' using errcode = '42501'; end if;
  insert into public.task_assignments (org_id, task_id, employee_id, bid_id, assigned_by) values (b.org_id, b.task_id, b.employee_id, b.id, p_by) returning id into v_as;
  update public.tasks set assignee_id = b.employee_id where id = b.task_id;
  update public.twin_bids set status = 'won', decided_at = now() where id = b.id;
  update public.twin_bids set status = 'lost', decided_at = now() where task_id = b.task_id and status = 'open' and id <> b.id;
  insert into public.audit_events (org_id, actor, action, resource, meta) values (b.org_id, p_by, 'twin_bid.assigned', 'tasks/' || b.task_id::text, jsonb_build_object('bid', b.id, 'employee', b.employee_id));
  return v_as;
end $$;
revoke all on function public.finalize_bid(uuid, uuid) from public, anon, authenticated;

-- İstemci girişi: owner/org_admin/operations/account/pm. Görev önceliği 'high' ise önce onay (required_role=operations) oluşur; 'approved' olunca atama yapılır.
create or replace function public.assign_bid(p_bid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; t record; a record; v_emp uuid; v_ap uuid; v_as uuid; v_who text;
begin
  select * into b from public.twin_bids where id = p_bid;
  if not found then raise exception 'teklif yok' using errcode = 'P0002'; end if;
  if not core.has_role(b.org_id, array['owner','org_admin','operations','account','pm']::core.app_role[]) then raise exception 'yetki yok' using errcode = '42501'; end if;
  if b.status <> 'open' then raise exception 'teklif artık açık değil' using errcode = '42501'; end if;
  select * into t from public.tasks where id = b.task_id;
  if t.priority = 'high' then
    select id, status into a from public.approvals where org_id = b.org_id and subject ->> 'bid_id' = p_bid::text order by created_at desc limit 1;
    if found and a.status = 'pending' then return jsonb_build_object('status', 'pending_approval', 'approval_id', a.id); end if;
    if not found or a.status <> 'approved' then
      select id into v_emp from public.employees where org_id = b.org_id and auth_user_id = auth.uid();
      select name into v_who from public.employees where id = b.employee_id;
      insert into public.approvals (org_id, action_type, title, subject, required_role, requested_by, due_at)
        values (b.org_id, 'scope', 'Yüksek öncelikli atama: ' || t.title || ' → ' || coalesce(v_who, 'ikiz'),
                jsonb_build_object('project_id', t.project_id, 'task_id', t.id, 'bid_id', b.id, 'note', 'Güven %' || b.confidence || ' · tahmini ' || b.eta_hours || ' sa'),
                'operations', v_emp, coalesce(t.due_at, now() + interval '3 days'))
        returning id into v_ap;
      insert into public.audit_events (org_id, actor, action, resource, meta) values (b.org_id, auth.uid(), 'twin_bid.approval_requested', 'tasks/' || t.id::text, jsonb_build_object('bid', b.id, 'approval', v_ap));
      return jsonb_build_object('status', 'pending_approval', 'approval_id', v_ap);
    end if;
  end if;
  v_as := public.finalize_bid(p_bid, auth.uid());
  return jsonb_build_object('status', 'assigned', 'assignment_id', v_as);
end $$;
revoke all on function public.assign_bid(uuid) from public, anon; grant execute on function public.assign_bid(uuid) to authenticated;

-- Onay 'approved' olunca (subject.bid_id) bekleyen ataması gerçekleştir.
create or replace function core.bid_approval_finalize() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status = 'pending' and new.subject ->> 'bid_id' is not null
     and exists (select 1 from public.twin_bids where id = (new.subject ->> 'bid_id')::uuid and status = 'open') then
    perform public.finalize_bid((new.subject ->> 'bid_id')::uuid, new.decided_by);
  end if;
  return new;
end $$;
create trigger approvals_bid_finalize after update on public.approvals for each row execute function core.bid_approval_finalize();
