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
| `supabase/migrations/0014_admin.sql` | Ana Yönetim Paneli: `memberships.status` (active/disabled), RLS yardımcıları + auth hook yalnızca aktif üyelikleri sayar, `public.admin_revoke_sessions(uuid)` (servis rolü), `audit_events (org_id, action, occurred_at)` indeksi |
| `supabase/migrations/0016_workspace_setup.sql` | Çalışma alanı & kurulum (0015'ten bağımsız): `user_prefs(user_id pk, org_id, prefs jsonb, updated_at)` + RLS (yalnızca sahibi), `employees.manager_id` (→ employees, set null) / `team` / `hired_at` + indeksler + kendi kendine yönetici yasağı, `tasks`/`approvals`/`notifications` → `supabase_realtime` yayını |
| `supabase/migrations/0019_notifications.sql` | Bildirimler: `email_log` (servis rolü yazar, owner/org_admin okur), `notifications` kişi/tekilleştirme/bekleyen e-posta indeksleri, `notifications_u` yalnızca satır sahibi ya da owner/org_admin, `notification_rules` tekil `(org_id, event_type, channel)` + eski olay adları → türler + org başına varsayılanlar (yeni org tetikleyicisi), realtime yayını güvencesi |
| `supabase/migrations/0020_hubspot.sql` | HubSpot (CRM) senkron: `client_contacts` (gerçek kolonlar + `data`, `source_ref` tekil, touch/emit tetikleyicileri, RLS: iç okur, owner/org_admin/operations/account/pm yazar, müşteri rolleri kendi müşterisinin kişilerini okur, realtime), `integration_links (provider, entity, local_id, remote_id, remote_updated_at, local_updated_at, synced_at; unique(provider,entity,remote_id))`, `clients`/`brands`/`crm_deals` → `source_ref` + `updated_at`/`sync_origin`/`synced_at` + genel `core.sync_touch()` (0010 kuralı), `clients_emit`, `integration_sync_log` okuma operations/account/pm'e açılır |
| `supabase/migrations/0021_google_workspace.sql` | Google Workspace (Gmail + Takvim): `user_integrations(user_id, provider pk; config jsonb {tokens_enc AES-GCM}, scopes, email, connected_at)` yalnızca sahibi okur / servis rolü yazar; `mail_threads` (org posta kutusu konuları: gmail_thread_id uniq, client/brand/contact/request bağı, unread/archived/labels, realtime) iç roller okur, CRM rolleri günceller, servis rolü ekler; `mail_messages` (gmail_message_id uniq, temizlenmiş HTML, ek meta, threading başlıkları, outbound); her org'a `integrations(provider='google')` satırı + yeni org tetikleyicisi |
| `supabase/migrations/0022_personal_agents.sql` | Kişisel ajan filosu (Agency OS Faz 3): `personal_agents`, `agent_versions`; `core.supervises(org, employee)` (owner/org_admin ∨ kendisi ∨ yönetici zinciri); RLS satır düzeyinde; tetikleyiciler: sürüm içeriği değişmez, geçişler draft→active\|rejected ve active→superseded, ajan başına tek yürürlükte sürüm, `current_version` yalnızca onayla ilerler. Yerel doğrulama: `tests/supabase-local-mock.sql` + `tests/0022_personal_agents.rls.sql` |
| `seed/*.csv`, `seed/seed.sql` | BBY ekibi (maaşsız), 24 marka, task_types, decision_rights, bildirim varsayılanları (`notification_defaults.csv`: tür × kanal, roller boş = herkes; `on conflict do nothing`) |

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
