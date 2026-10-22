-- JS Ecosystem · 0014 Ana Yönetim Paneli (apps/admin)
-- Minimal: memberships.status (devre dışı bırakma), RLS yardımcılarında devre dışı üyeliklerin dışlanması,
-- oturum iptali için servis-rolü fonksiyonu ve denetim görüntüleyicisi için indeks.
-- Not: modül/özellik anahtarları (organizations.settings.feature_flags / feature_toggles) ve güvenlik ayarları
-- (settings.security.*) jsonb içinde yaşar; şema değişikliği gerektirmez.

alter table public.memberships add column if not exists status text not null default 'active';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'memberships_status_check') then
    alter table public.memberships add constraint memberships_status_check check (status in ('active','disabled'));
  end if;
end $$;
create index if not exists memberships_org_status_idx on public.memberships (org_id, status);

-- RLS yardımcıları: yalnızca AKTİF üyelikler sayılır.
create or replace function core.my_orgs() returns setof uuid language sql stable security definer set search_path = public as
$$ select org_id from public.memberships where user_id = auth.uid() and status = 'active' $$;

create or replace function core.role(p_org uuid default null) returns core.app_role language sql stable security definer set search_path = public as
$$ select coalesce(
     (select role from public.memberships where user_id = auth.uid() and status = 'active' and org_id = coalesce(p_org, nullif(auth.jwt() ->> 'org_id','')::uuid) limit 1),
     case when exists (select 1 from public.memberships where user_id = auth.uid() and status = 'disabled') and not exists (select 1 from public.memberships where user_id = auth.uid() and status = 'active') then null
          else nullif(auth.jwt() ->> 'app_role','')::core.app_role end) $$;

create or replace function core.has_role(p_org uuid, p_roles core.app_role[]) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.memberships where user_id = auth.uid() and org_id = p_org and status = 'active' and role = any(p_roles)) $$;

create or replace function core.is_internal(p_org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.memberships where user_id = auth.uid() and org_id = p_org and status = 'active' and role not in ('client_admin','client_viewer')) $$;

create or replace function core.client_ids(p_org uuid) returns uuid[] language sql stable security definer set search_path = public as
$$ select coalesce((select array(select jsonb_array_elements_text(scopes -> 'client_ids')::uuid) from public.memberships where user_id = auth.uid() and org_id = p_org and status = 'active'), '{}') $$;

-- Auth hook (0011 gövdesi): yalnızca aktif üyelik JWT'ye rol yazar.
create or replace function core.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare claims jsonb := event -> 'claims'; m record; uid uuid := (event ->> 'user_id')::uuid; emp jsonb; cl jsonb;
begin
  select * into m from public.memberships where user_id = uid and status = 'active' order by created_at limit 1;
  if found then
    claims := jsonb_set(claims, '{app_role}', to_jsonb(m.role::text));
    claims := jsonb_set(claims, '{org_id}', to_jsonb(m.org_id::text));
    select to_jsonb(id::text) into emp from public.employees where auth_user_id = uid limit 1;
    if emp is not null then claims := jsonb_set(claims, '{employee_id}', emp); end if;
    cl := m.scopes -> 'client_ids' -> 0;
    if cl is not null and jsonb_typeof(cl) = 'string' then claims := jsonb_set(claims, '{client_scope}', cl); end if;
  end if;
  return jsonb_set(event, '{claims}', claims);
end $$;
revoke execute on function core.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant execute on function core.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Bir kullanıcının tüm oturumlarını (ve yenileme jetonlarını) siler. Yalnızca servis rolü (apps/admin sunucu rotaları).
create or replace function public.admin_revoke_sessions(p_user uuid) returns integer language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- Denetim görüntüleyicisi (eylem filtresi + zaman sırası).
create index if not exists audit_events_org_action_idx on public.audit_events (org_id, action, occurred_at desc);
