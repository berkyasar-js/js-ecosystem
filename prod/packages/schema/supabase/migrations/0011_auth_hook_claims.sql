-- JS Ecosystem · 0011 Auth hook düzeltmesi: `client_id` Supabase JWT şemasında ayrılmış/string tipli bir claim;
-- null yazınca /token 500 veriyordu ("client_id: Invalid type. Expected: string, given: null").
-- Müşteri kapsamı artık yalnızca varsa `client_scope` claim'i olarak yazılır; employee_id yoksa claim eklenmez.
create or replace function core.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare claims jsonb := event -> 'claims'; m record; uid uuid := (event ->> 'user_id')::uuid; emp jsonb; cl jsonb;
begin
  select * into m from public.memberships where user_id = uid order by created_at limit 1;
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
