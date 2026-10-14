-- JS Ecosystem seed (psql ile). Önkoşul: 0001-0004 uygulanmış. Kullanım:
--   psql "$SUPABASE_DB_URL" -v org_slug=jobs -v org_name="'Jobs Studio'" -f seed.sql   (packages/schema/seed klasöründen)
-- CSV'ler client tarafı \copy ile okunur. Maaş (salary_minor) KASITLI olarak yüklenmez; bordro ayrı süreçle girilir.
begin;
insert into organizations (name, slug) values (:org_name, :'org_slug') on conflict (slug) do nothing;
select id as org_id from organizations where slug = :'org_slug' \gset

create temp table s_team (code text, name text, role_title text, app_role text, weekly_hours int);
create temp table s_brands (code text, name text, sector text, status text, account_owner_code text, art_director_code text, copywriter_code text, health int, internal boolean, monthly_quota jsonb);
create temp table s_tt (key text, label text, sla_hours int, default_minutes int, unit_price_minor bigint);
create temp table s_dr (action text, level int, decider text, limit_minor bigint, notes text);
create temp table s_nd (event_type text, channel text, roles text, enabled boolean);
\copy s_team from 'team.csv' csv header
\copy s_brands from 'brands.csv' csv header
\copy s_tt from 'task_types.csv' csv header
\copy s_dr from 'decision_rights.csv' csv header
\copy s_nd from 'notification_defaults.csv' csv header

insert into employees (org_id, code, name, role_title, app_role, weekly_hours)
  select :'org_id', code, name, role_title, app_role::core.app_role, weekly_hours from s_team;
insert into clients (org_id, name, sector) select :'org_id', name, sector from s_brands;
insert into brands (org_id, client_id, name, sector, status, account_owner, art_director, copywriter, health, internal, monthly_quota)
  select :'org_id', c.id, b.name, b.sector, b.status,
         (select id from employees e where e.org_id = :'org_id' and e.code = b.account_owner_code),
         (select id from employees e where e.org_id = :'org_id' and e.code = b.art_director_code),
         (select id from employees e where e.org_id = :'org_id' and e.code = b.copywriter_code),
         b.health, b.internal, b.monthly_quota
  from s_brands b join clients c on c.org_id = :'org_id' and c.name = b.name;
insert into task_types (org_id, key, label, sla_hours, default_minutes, unit_price_minor) select :'org_id', * from s_tt;
insert into decision_rights (org_id, action, level, decider, limit_minor, notes) select :'org_id', * from s_dr;
insert into notification_rules (org_id, event_type, channel, roles, enabled)
  select :'org_id', event_type, channel, string_to_array(roles, ';')::core.app_role[], enabled from s_nd;
commit;
