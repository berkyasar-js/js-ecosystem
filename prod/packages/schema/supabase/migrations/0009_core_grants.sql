-- JS Ecosystem · 0009: core şeması erişimi. Tetikleyici fonksiyonlar (core.emit_event, core.tasks_touch, core.require_screen_consent)
-- ve RLS yardımcıları core şemasında; çağıran rolün şemada USAGE hakkı yoksa "permission denied for schema core" alınır.
grant usage on schema core to authenticated, anon, service_role;
grant execute on all functions in schema core to authenticated, service_role;
grant execute on function core.role(uuid), core.me(), core.org(), core.my_orgs(), core.has_role(uuid, core.app_role[]), core.is_internal(uuid), core.client_ids(uuid), core.can_see_brand(uuid, uuid) to anon;
alter default privileges in schema core grant execute on functions to authenticated, service_role;
-- Auth hook yalnızca supabase_auth_admin tarafından çağrılmalı
revoke execute on function core.custom_access_token_hook(jsonb) from authenticated, anon, public;
