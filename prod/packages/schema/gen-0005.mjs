// 0005_modules.sql üretici — kaynak: packages/contracts COLLECTIONS (tek doğruluk kaynağı).
// Kullanım: node --experimental-strip-types gen-0005.mjs > supabase/migrations/0005_modules.sql  (Node >= 22.6)
import { COLLECTIONS } from '../contracts/src/modules.ts';

const EXISTING = new Set(['time_entries', 'invoices', 'surveys', 'survey_responses']); // 0002/0003'te var → yalnızca ALTER
const arr = (roles) => `array[${roles.map((r) => `'${r}'`).join(',')}]::core.app_role[]`;
const out = [];
const p = (s = '') => out.push(s);

p('-- JS Ecosystem · 0005 modules — ÜRETİLDİ (gen-0005.mjs). Elle düzenleme: contracts/src/modules.ts → yeniden üret.');
p('-- Ortak biçim: id, org_id, [brand_id], data jsonb, created_at. COLLECTIONS.native kolonları gerçek kolon; kalanı data içinde.');
p('-- RLS: okuma modu = internal | rol listesi | brand_all | brand_visible (müşteri yalnızca kendi markası + client_visible); yazma = rol listesi.');
p();
p('-- Mevcut tablolara ek kolonlar');
p('alter table public.time_entries alter column task_id drop not null;');
p('alter table public.time_entries drop constraint if exists time_entries_minutes_check;');
p('alter table public.time_entries add constraint time_entries_minutes_nonneg check (minutes >= 0);   -- çalışan zamanlayıcı: 0 dk + data.started_at');
for (const t of EXISTING) {
  p(`alter table public.${t} add column if not exists data jsonb not null default '{}'::jsonb;`);
  p(`alter table public.${t} add column if not exists brand_id uuid references public.brands(id);`);
}
p(`alter table public.invoices add column if not exists created_at timestamptz not null default now();`);
p(`alter table public.time_entries alter column note drop not null;`);
p();

const policies = [];
for (const [kind, m] of Object.entries(COLLECTIONS)) {
  const t = m.table;
  if (!EXISTING.has(kind)) {
    p(`create table public.${t} (`);
    p('  id uuid primary key default gen_random_uuid(),');
    p('  org_id uuid not null references public.organizations(id) on delete cascade,');
    p('  brand_id uuid references public.brands(id) on delete set null,');
    p("  data jsonb not null default '{}'::jsonb,");
    p('  created_at timestamptz not null default now()');
    p(');');
    p(`create index on public.${t} (org_id, created_at desc);`);
    p(`alter table public.${t} enable row level security;`);
  }
  if (EXISTING.has(kind) && kind !== 'survey_responses' && kind !== 'surveys') continue; // invoices/time_entries: mevcut politikalar yeterli (+ aşağıdaki ekler)
  const nb = m.nullBrand ? ' or (brand_id is null and org_id in (select core.my_orgs()))' : '';
  let sel;
  if (m.read === 'internal') sel = 'core.is_internal(org_id)';
  else if (Array.isArray(m.read)) sel = `core.has_role(org_id, ${arr(m.read)})`;
  else if (m.read === 'brand_all') sel = `(core.can_see_brand(org_id, brand_id)${nb})`;
  else sel = "(core.can_see_brand(org_id, brand_id) and (core.is_internal(org_id) or coalesce((data ->> 'client_visible')::boolean, false)))";
  const sfx = EXISTING.has(kind) ? '_m5' : '';
  policies.push(`create policy ${t}_r${sfx} on public.${t} for select using (${sel});`);
  const upd = m.update ?? m.write;
  policies.push(`create policy ${t}_i${sfx} on public.${t} for insert with check (core.has_role(org_id, ${arr(m.write)}));`);
  policies.push(`create policy ${t}_u${sfx} on public.${t} for update using (core.has_role(org_id, ${arr(upd)})) with check (core.has_role(org_id, ${arr(upd)}));`);
  policies.push(`create policy ${t}_d${sfx} on public.${t} for delete using (core.has_role(org_id, ${arr(m.write)}));`);
  if (m.clientWrite) policies.push(`create policy ${t}_ci${sfx} on public.${t} for insert with check (core.has_role(org_id, ${arr(m.clientWrite)}) and core.can_see_brand(org_id, brand_id));   -- müşteri: yalnızca kendi markasına EKLEME`);
}
p('-- ───── RLS politikaları ─────');
policies.forEach((x) => p(x));
p();
p('-- Mevcut tablolar için ek politikalar');
p("create policy time_u on public.time_entries for update using (employee_id = core.me()) with check (employee_id = core.me());   -- kendi zamanlayıcısını durdurur");
p('');
p('-- Yeni kullanıcı kayıtları (başvuru formu, anon): yalnızca AÇIK pozisyon + aşama=applied');
p("create policy jobs_apply_r on public.jobs for select to anon using (data ->> 'status' = 'open');");
p("create policy cand_apply_i on public.candidates for insert to anon with check (data ->> 'stage' = 'applied' and data ->> 'source' = 'apply' and exists (select 1 from public.jobs j where j.id::text = data ->> 'job_id' and j.org_id = candidates.org_id and j.data ->> 'status' = 'open'));");
p('grant insert on public.candidates to anon; grant select on public.jobs to anon;');
p('');
p('-- İK denetim kayıtları: İK rolü yalnızca hr_* kaynaklarını görür (özlük arşivi erişim logu)');
p("create policy audit_hr_r on public.audit_events for select using (core.has_role(org_id, array['hr']::core.app_role[]) and (action like 'hr%' or resource like 'hr%'));");
p('');
p(`-- Teklif kabulü → çalışan + hr_profile + onboarding checklist + ilk görev (tek işlem). Yetki: owner/org_admin/hr.
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
revoke all on function public.approve_social_batch(uuid) from public, anon; grant execute on function public.approve_social_batch(uuid) to authenticated;`);
console.log(out.join('\n'));
