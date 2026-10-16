# JS Ecosystem — üretim temeli

Next.js 15 (App Router) + Supabase (Postgres/RLS/Auth/Realtime) + Anthropic. Repo kökündeki statik prototip **değiştirilmez**; her şey `prod/` altındadır.

```
prod/
  apps/web              Next.js 15, TS strict, Tailwind v4 (tokenlar CSS değişkeni), @dnd-kit, lucide
  packages/contracts    Role/Permission tipleri, modül kataloğu, tablo tipleri, zod şemaları
  packages/schema       supabase/migrations/0001..0006 + seed (CSV) — bkz. packages/schema/README.md
  packages/prompts      Ajan promptları (md) + SQL üretici
```

## Hızlı başlangıç (DEMO — env gerekmez)
```bash
cd prod && npm install
npm run dev            # http://localhost:3000 → /login → rol seç
npm test && npm run lint && npm run build
```
`NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` yoksa uygulama **Demo modunda** çalışır: veri `lib/demo-seed.ts`'ten gelir, tarayıcıda localStorage'a yazılır, üstte "Demo modu — veritabanı bağlı değil" bandı çıkar. `/api/mcp` demo token'ı: `jsdemo_token`.

## Üretim kurulumu
1. **Supabase projesi** oluştur (Dashboard → New project).
2. **Migration'lar**: `packages/schema/README.md` — `supabase link` + `supabase db push`, auth hook'u etkinleştir, `seed.sql` ve `npm run prompts:sql`.
3. **Auth sağlayıcıları**: Authentication → Providers → *Google* (Client ID/Secret) ve *Email* (OTP; e-posta şablonunda `{{ .Token }}` kullan). Site URL ve Redirect URL: `https://<alan>/auth/callback`.
4. **Env** (`.env.example` → Vercel Project Settings → Environment Variables):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (yalnızca sunucu), `ANTHROPIC_API_KEY`, `JSCORE_WEBHOOK_SECRET`, `CRON_SECRET` (otomasyon cron'u için).
5. **Vercel**: repo'yu içe aktar → **Root Directory = `prod/apps/web`** (framework otomatik Next.js; `prod/apps/web/vercel.json` yalnızca otomasyon cron'unu tanımlar). "Include source files outside of the Root Directory" **açık** olmalı (workspace paketi `@jscore/contracts` için); Install Command: `cd ../.. && npm install`.
6. **Otomasyonlar (cron)**: `vercel.json` her 5 dakikada `GET /api/events/dispatch` çağırır (Vercel Cron; Hobby planda en sık günlük — sık çalışması için Pro veya harici zamanlayıcı). `CRON_SECRET` tanımlı olmalı. Elle/harici tetikleme: `POST` + `x-jscore-signature: sha256=HMAC(gövde, JSCORE_WEBHOOK_SECRET)` ya da `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
7. İlk kullanıcıyı `memberships`'e owner olarak ekle (schema README, adım 6).

## Mimari notları
- **Repo katmanı** (`lib/repo`): `Repo` arayüzü; `SupabaseRepo` (browser/server Supabase istemcisi, her sorgu kullanıcının JWT'si ile → RLS), `DemoRepo` (bellek/localStorage). Sunucuda `getRepo()`, istemcide `createClientRepo()`.
- **Yetki**: `contracts` içinde `hasPermission(role, product, resource, action)`; Owner/Org Admin için `payroll` ve `hr_archive` varsayılan kapalı. Onay kararı kuralı `canDecideApproval` hem UI'da hem repo/API'de, RLS'te de karşılığı var.
- **Ajanlar**: `/api/agents/run` → aktif `agent_prompts` → Anthropic → zod doğrulama → `agent_runs` (token/maliyet). Demo/anahtarsız modda deterministik çıktı. Kota kuralı (`lib/quota.ts`): sözleşme kotası aşan taslak "kapsam dışı" onayına gider.
- **Webhook**: `POST /api/webhooks/:provider`, ham gövde üzerinde HMAC-SHA256 (`x-jscore-signature: sha256=…`). **MCP**: `POST /api/mcp` JSON-RPC (`tools/list`, `tools/call`: `project_status`, `create_task_draft`), `Authorization: Bearer` → `access_tokens.token_hash` (iptal + son kullanma + `mcp` kapsamı kontrolü). `/api/webhooks/:provider` de `Authorization: Bearer <anahtar>` (`webhooks` kapsamı) kabul eder; yoksa HMAC yolu aynen çalışır.

## Modül durumu
Tüm modüller `apps/web/src/app/app/<slug>` altında; bileşenler `components/modules/*`. Veri `Repo` genel koleksiyon katmanından (`list/save/remove/audit`) geçer; izinler `packages/contracts/src/modules.ts` içindeki `COLLECTIONS` tablosundan gelir (Repo, demo, test ve RLS SQL tek kaynak).

| Modül | Durum |
|---|---|
| mywork, crm (kanban, Account 360, teklif + PDF), resources, finance, people (HRIS, Employee 360, arşiv, Kolay İK), hire (+ /apply/[job]), portal, insights, automations, marketplace, media, review, transfer, studio, social, present, marketing, events | Canlı (DemoRepo + SupabaseRepo) |
| messages | Canlı, Realtime yedeği olarak polling |
| Ajan maliyet tavanı (402 + ₺ ilerleme), API anahtarları (Connect), twin ihalesi (`twin_bids`, onay kapılı atama), olayda tetiklenen otomasyonlar (dispatcher + cron) | Canlı (DemoRepo + SupabaseRepo, 0006) — bkz. *Kapatılan boşluklar* |

- Migration `packages/schema/supabase/migrations/0005_modules.sql` `packages/schema/gen-0005.mjs` ile contracts'tan üretilir (`node --experimental-strip-types packages/schema/gen-0005.mjs`); küçük katalog seed: `packages/schema/seed/seed_modules.sql`.
- PDF: `lib/pdf.ts` (bağımsız yazıcı) + `/api/pdf/proposal`. Yeni ajan: `studio_draft`.

## Kapatılan boşluklar (0006)
| Boşluk | Durum | Demo | Supabase |
|---|---|---|---|
| Aylık ajan maliyet tavanı | Tamam | `/api/agents/run` istemcinin bildirdiği ay içi harcama + tavanı (`demo_spend_usd`, `demo_cap_usd`; sunucu durumsuz) kullanır | Ay içi `agent_runs.cost_usd` toplamı servis rolüyle okunur (RLS okumayı kısıtladığı için) |
| API anahtarı arayüzü | Tamam | Connect → *API Anahtarları*: bellek içi; meta saklanır, düz token/özet saklanmaz | `POST/GET/DELETE /api/tokens`; yalnızca sha256 `access_tokens.token_hash` |
| Ajan ihalesi (twin bids) | Tamam | `DemoRepo` deterministik teklif üretir (`agents/demo.ts`) | `twin_bid` ajanı → zod → `twin_bids` |
| Olayda tetiklenen otomasyonlar | Tamam | `DemoRepo` her olay üreten yazmadan sonra dispatcher'ı senkron çağırır | Cron → `/api/events/dispatch` |

- **Maliyet tavanı** (`lib/agents/cap.ts`): `settings.ai.monthly_cap_usd` (USD; **0 = tavan yok**), ₺ gösterimi `settings.ai.usd_try` (varsayılan 40). Ay içi harcama + son 5 çalıştırmanın ortalama maliyeti (yoksa $0,05) tavanı aşarsa `POST /api/agents/run` **402** ve Türkçe mesaj döner. Board başlığı ve Admin → Yapay zekâ'da "Bu ay: ₺X / tavan ₺Y" çubuğu görünür.
- **API anahtarları**: yetki owner / org_admin / integration_admin (RLS `tok_w` ile aynı). Kapsamlar `mcp`, `webhooks`, `<ürün>:read`. Not: ayrı bir `core.api_tokens` açılmadı; mevcut `public.access_tokens` (hash, prefix, scopes, revoked_at, last_used_at) `user_id` ve `expires_at` ile genişletildi. 0006 ayrıca `token_hash` sütununu istemci rollerinden gerçekten gizler (0003'teki sütun revoke'u tablo grant'ı varken etkisizdi).
- **İhale**: tablo `public.twin_bids` (= `twins.bids`), atamalar `public.task_assignments`. Proje detayı → görevde *İhale* ve Twins → *Görev ihaleleri*: "İhaleye aç" (yalnızca onaylı, opt-out olmayan kişi ikizleri) → "Ata". Görev önceliği `high` ise Ata bir onay (`action_type=scope`, `required_role=operations`, `subject.bid_id`) açar; onay `approved` olunca atama yapılır (demo: `decideApproval` içinde, Supabase: `approvals_bid_finalize` tetikleyicisi). Atama `task_assignments` yazar, teklifi `won`/diğerlerini `lost` yapar, olay üretir. `twin_bid` promptu: `packages/prompts/prompts/twin_bid.md` → `npm run prompts:sql` ile `agent_prompts`'a yüklenir.
- **Otomasyon dispatcher** (`lib/automations/dispatch.ts`): yalnızca *yayındaki* kurallar. Tetik = olay türü (`tasks.update`, `approvals.insert`, `invoices.update`, `leaves.update` …; `core.events.type` ile aynı) + isteğe bağlı eşitlik filtresi (`new.state=delivery`; koleksiyonlarda `new.data.*` otomatik denenir). Eski metin tetikleyiciler (`task.state = delivery` …) otomatik çözülür. Update olaylarında filtrelenen alanın gerçekten **değişmesi** gerekir. Aksiyonlar: görev oluştur, uygulama içi bildirim (owner/org_admin/operations), görev aşaması, webhook (Supabase'de `x-jscore-signature` ile HMAC-SHA256, `lib/hmac.ts`; özel/iç ağ adresleri reddedilir). `condition` metni bilgilendiricidir (değerlendirilmez; filtre kullanın). Otomasyonun oluşturduğu görevler (`source_ref=automation:*`) yeniden tetiklemez. Automations sayfası "Son tetiklenme" ve çalıştırma günlüğünü gösterir.
  Supabase: `/api/events/dispatch` `events.processed_at IS NULL` satırlarını talep eder (önce işaretler), kuralları çalıştırır; 0006 `allocations`, `leaves`, `candidates`, `crm_deals`, `twin_bids`, `task_assignments` için de `emit_event` tetikleyicisi ekler.

## Trello entegrasyonu
Ajansın Trello'daki işini JS Work'e yansıtır (Connect → Entegrasyonlar → **Trello**). Yetki: owner / org_admin / integration_admin (ya da `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` + `x-jscore-org`).

**Kurulum (Supabase):**
1. `0007_trello.sql` migration'ını uygula (`integrations.config` + `last_sync_at`; `config` istemci rollerinden sütun-seviyesinde gizlenir). `SUPABASE_SERVICE_ROLE_KEY` tanımlı olmalı.
2. Trello'da API Key + Token al: **trello.com/power-ups/admin** → *New* (ya da var olan Power-Up) → Power-Up'ı oluştur → **API key** sekmesinde *Generate a new API Key* → çıkan sayfada key'in yanındaki **"Token"** bağlantısına tıkla → *Allow* (yalnızca okuma yeterli; webhook kurmak için hesabın panolara erişimi olmalı) → çıkan token'ı kopyala. Webhook imzası için aynı sayfadaki **Secret** → `TRELLO_API_SECRET` (opsiyonel).
3. Connect → Trello'ya **API Key** ve **Token**'ı yapıştır → *Bağla* (`/1/members/me` ile doğrulanır; değerler yalnızca sunucuda saklanır, arayüzde maskeli görünür).
4. Panoları işaretle (işaretlenmezse tüm açık panolar) → **Tam içe aktar**. Sonuç panelinde sayımlar ve *eşlenemeyen kişiler* çıkar; her ad için çalışan seç → eşleme `integrations.config.member_map`'e kaydedilir, sonraki içe aktarmada kullanılır.
5. Canlı eşitleme için **Webhook kur** (herkese açık HTTPS adres gerekir; `APP_URL` ya da istek başlıkları). Geri çağrı: `POST /api/webhooks/trello?org=<org>&k=<gizli>`; `HEAD` 200 döner. `TRELLO_API_SECRET` varsa `x-trello-webhook` (base64 HMAC-SHA1, gövde+callbackURL) zorunlu, yoksa `k` eşleşmeli. `createCard/updateCard/moveCard…` kartı yeniden çekip görevi günceller; `deleteCard` görevi arşive alır.

**Eşleme kuralları** (`lib/integrations/trello-map.ts`, saf ve testli): liste türü → kişi kuyruğu (atanan; `Kontrol` → *iç revize*, aksi halde *üretim*), `… Müşteri Onay` → *onay*, `… Teslim` → *teslim*, `Kurulum-Baskı-Produksiyon` → *üretim*, `Bekleme Salonu` → *brief* + `waiting`, `Kasım26 SM` → *plan*, adında `şablon` geçen listeler **atlanır**; arşivli listedeki açık kartlar *arşiv* + `trello:archived-list`. Kart adı: `NNN_` iş no (`job:NNN` etiketi), marka = ay / ` SM` / `-` öncesi, mevcut markalara bulanık eşleşir, bilinmeyen marka → müşteri+marka `prospect`. `… <Ay>'YY SM` → proje `<Marka> <Ay'YY> SM` (tür `social_monthly`, görev türü `social_visual`); diğer kartlar → marka başına tek proje `<Marka> · Trello` (tür `imported`). Her kart bir görev: `source_ref=trello:<cardId>` (tekrarlı içe aktarma çift kayıt üretmez), etiketler = `trello` + Trello etiketleri + `board:<pano>`, gecikmiş (ve tamamlanmamış) → `high`, checklist öğe sayısı × 30 dk = `planned_minutes`, ilerleme `checklist 4/12` etiketi (tasks'ta açıklama/meta sütunu yok; kart açıklaması aktarılmaz), `client_visible=false`. Atanan: kişi listesi, yoksa ilk eşlenebilir kart üyesi (ad/ilk ad/baş harf; belirsizse eşlenmez → dropdown). Yazmalar tetikleyicilerle (`emit_event`) normal olay yolundan geçer, otomasyonlar çalışır.

**Demo:** anahtarsız modda *Örnek veriyle dene* 10 kartlık örnek (`trello-fixture.ts`) aynı çekirdekten geçer; `DemoRepo.trelloImport()` olayları dispatcher'a senkron verir.

## Bilinen eksikler
Trello: gerçek Trello API'sine karşı uçtan uca denenmedi (anahtar yok; HTTP katmanı ve Supabase deposu yalnızca derleme/ham mantık testiyle doğrulandı), webhook'lar kart bazlı yeniden çekim yapar (Trello'daki değişiklik JS Work'teki elle düzenlemenin üstüne yazar), silinen/arşivlenen kart tam içe aktarmada arşive alınmaz (yalnızca webhook ile), 1000+ kartta tek istek/pano limiti (Trello 1000 kart sınırı) geçerlidir. 
Supabase uçtan uca doğrulanmadı (instance yok; jsonb katman, RPC (`assign_bid`, `hire_candidate`…) ve RLS/tetikleyiciler canlı DB'de test edilmedi; 0006 yalnızca statik testle doğrulandı), tarayıcıda görsel test yapılmadı, dosya yükleme/Vimeo/MinIO simüle. Demo'da API anahtarları yalnızca tarayıcıda yaşar (sunucu durumsuz; sunucu uçları demo için `jsdemo_token` kabul eder) ve demo webhook aksiyonu ağ çağrısı yapmaz. Otomasyon zincirleme tetiklemesi (bir kuralın ürettiği olayın başka kuralı tetiklemesi) demoda yok. Otomasyon `condition` ifadeleri değerlendirilmez. Cron aralığı Vercel planına bağlıdır.
