# @jscore/schema — Supabase şeması + seed

| Dosya | İçerik |
|---|---|
| `supabase/migrations/0001_core.sql` | organizations, memberships, employees (maaş kolonları REVOKE), `core.*` RLS yardımcıları, JWT auth hook, audit_events |
| `supabase/migrations/0002_work.sql` | clients, brands, projects, tasks, task_types, time_entries, approvals, channels/messages (Realtime), surveys, consents, screen_activity (rıza trigger'ı) |
| `supabase/migrations/0003_events.sql` | events + `emit_event` trigger (tasks/approvals/invoices), notification_rules, integrations, mcp_servers, access_tokens (token_hash), webhooks, kpi_snapshots, system_health |
| `supabase/migrations/0004_agents.sql` | employee_twins, agent_prompts, agent_runs, board_decisions, decision_rights |
| `supabase/migrations/0005_modules.sql` | modül koleksiyonları (gen-0005.mjs ile üretilir) |
| `supabase/migrations/0006_gaps.sql` | API anahtarı alanları (access_tokens.user_id/expires_at), `twin_bids` + `task_assignments` (ihale), `assign_bid()` onay kapısı, olay tetikleyicileri, `events.processed_at` |
| `supabase/migrations/0007_trello.sql` | Trello entegrasyonu: `integrations.config` (sunucu-tarafı API Key/Token; istemci rollerinden sütun-seviyesi gizli) + `last_sync_at`, `tasks` için `trello:%` source_ref indeksi |
| `seed/*.csv`, `seed/seed.sql` | BBY ekibi (maaşsız), 24 marka, task_types, decision_rights, bildirim varsayılanları |

## Kurulum (`supabase db push`)

```bash
# 1) Supabase CLI ile projeye bağlan (proje ref'i Dashboard → Settings → General)
cd prod/packages/schema
supabase login
supabase link --project-ref <PROJECT_REF>

# 2) Migration'ları uygula (supabase/migrations burada olduğu için çalışma dizini packages/schema)
supabase db push

# 3) Auth hook: Dashboard → Authentication → Hooks → "Custom Access Token"
#    → Postgres function: core.custom_access_token_hook   (JWT'ye app_role/org_id/employee_id/client_id yazar)

# 4) Seed (organizasyon + ekip + 24 marka + task_types + karar hakları)
cd seed
psql "$SUPABASE_DB_URL" -v org_slug=jobs -v org_name="'Jobs Studio'" -f seed.sql

# 5) Ajan promptlarını yükle
npm run prompts:sql > /tmp/prompts.sql && psql "$SUPABASE_DB_URL" -f /tmp/prompts.sql

# 6) İlk kullanıcıyı owner yap (kullanıcı giriş yaptıktan sonra, SQL editor):
#    insert into memberships (user_id, org_id, role) values ('<auth.users.id>', '<org id>', 'owner');
#    update employees set auth_user_id = '<auth.users.id>' where code = 'BY';
```

Notlar
- `seed/gen.mjs` CSV'leri web demo seed'inden yeniden üretir (`node --experimental-strip-types gen.mjs`, Node ≥ 22.6).
- Müşteri kullanıcıları: `memberships.scopes = {"client_ids": ["<clients.id>"]}`; RLS yalnızca bu müşterilerin `client_visible` kayıtlarını gösterir.
- `salary_minor` / `hr_archive` / `access_tokens.token_hash` kolonları `authenticated` rolünden REVOKE edilmiştir; bordro/özlük okuması yalnızca `core.payroll_read()` / `core.hr_archive_read()` (rol kontrollü SECURITY DEFINER) ile yapılır.
- Migration'lar Postgres 15 / Supabase hosted ile yazıldı; yerelde `supabase start` + `supabase db reset` ile de doğrulanabilir (bu ortamda Docker olmadığından çalıştırılmadı).
