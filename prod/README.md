# JS Ecosystem — üretim temeli

Next.js 15 (App Router) + Supabase (Postgres/RLS/Auth/Realtime) + Anthropic. Repo kökündeki statik prototip **değiştirilmez**; her şey `prod/` altındadır.

```
prod/
  apps/web              Next.js 15, TS strict, Tailwind v4 (tokenlar CSS değişkeni), @dnd-kit, lucide
  packages/contracts    Role/Permission tipleri, modül kataloğu, tablo tipleri, zod şemaları
  packages/schema       supabase/migrations/0001..0012 + seed (CSV) — bkz. packages/schema/README.md
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

**Eşleme kuralları** (`lib/integrations/trello-map.ts`, saf ve testli): liste türü → kişi kuyruğu (atanan; `Kontrol` → *iç revize*, aksi halde *üretim*), `… Müşteri Onay` → *onay*, `… Teslim` → *teslim*, `Kurulum-Baskı-Produksiyon` → *üretim*, `Bekleme Salonu` → *brief* + `waiting`, `Kasım26 SM` → *plan*, `Ödüllü İşler` → *brief* + `ödül-fikri` etiketi (fikir havuzu), adında `şablon` geçen listeler **atlanır**; adında `İşler`, `Onay`, `Teslim`, `Şablon`, `Salonu`, `SM` sözcüğü geçen listeler kişi **değildir** (eşlenemeyen üye olarak raporlanmaz; `Berfin` gibi gerçek kişi adları raporlanmaya devam eder); arşivli listedeki açık kartlar *arşiv* + `trello:archived-list`. Kart adı: `NNN_` iş no (`job:NNN` etiketi), marka = ay / ` SM` / `-` öncesi, mevcut markalara bulanık eşleşir, bilinmeyen marka → müşteri+marka `prospect`. **Marka başına TAM BİR proje:** `<Marka> · Trello` (tür `imported`, `source_ref=trello:board:<ilk görülen pano>`, `client_visible=false`). Aylık `… <Ay>'YY SM` kartları da bu projede görev olur: görev türü `social_visual`, etiket `sm:<YYYY-MM>` (Türkçe ay adı + 2/4 haneli yıl, ör. `Kasım'26` → `sm:2026-11`), başlık özgün kart adını korur. **Geçiş (birleştirme):** her içe aktarmada önce markanın eski Trello projeleri (`source_ref` `trello:%`, `<Marka> <Ay'YY> SM` ya da `<Marka> · Trello` adlı) tek kanonik projeye toplanır — görevleri `tasks.project_id` güncellenerek taşınır, boşalan projeler `done` + ad sonuna ` (birleştirildi)` alır (**silinmez**), her birleştirme `integration_sync_log`'a (`reconcile` / `merged`) yazılır; ikinci çalıştırma değişiklik yapmaz. Her kart bir görev: `source_ref=trello:<cardId>` (tekrarlı içe aktarma çift kayıt üretmez), etiketler = `trello` + Trello etiketleri + `board:<pano>`, gecikmiş (ve tamamlanmamış) → `high`, checklist öğe sayısı × 30 dk = `planned_minutes`, ilerleme `checklist 4/12` etiketi (kart açıklaması, kapak, checklist'ler, yorumlar ve ekler 0012 ile ayrıca aktarılır: bkz. *Görev ayrıntıları*), `client_visible=false`. Atanan: kişi listesi, yoksa ilk eşlenebilir kart üyesi (ad/ilk ad/baş harf; belirsizse eşlenmez → dropdown). Yazmalar tetikleyicilerle (`emit_event`) normal olay yolundan geçer, otomasyonlar çalışır.

**Demo:** anahtarsız modda *Örnek veriyle dene* 10 kartlık örnek (`trello-fixture.ts`) aynı çekirdekten geçer; `DemoRepo.trelloImport()` olayları dispatcher'a senkron verir.

## Trello iki yönlü senkron (0008) ve Trello'dan çıkış planı
**Geçiş dönemi.** Ekip bir süre Trello ve JS Ecosystem'i PARALEL kullanır; Trello içeriği her zaman güncel kalmalıdır. Sonra Trello kapatılır. Bu yüzden entegrasyon iki yönlüdür (`integrations.config.mode`):

| Mod | Davranış |
|---|---|
| `two_way` (varsayılan) | Trello → JS (webhook + saatlik uzlaştırma) **ve** JS → Trello (kart yazımı) |
| `pull_only` | Yalnızca Trello → JS; kartlara hiçbir şey yazılmaz |
| `off` | Senkron durur, kayıtlı webhook'lar Trello'dan silinir; **veriler (görevler, projeler, eşlemeler, günlük) korunur** |

**Kurulum ek adımları:** `0008_trello_sync.sql` migration'ını uygula (`tasks.updated_at` + `sync_origin/synced_at`, `projects.source_ref`, `integration_sync_log`). Trello token'ı artık **yazma** yetkili olmalı (token oluştururken `scope=read,write`; Power-Up token bağlantısında *Allow* verirken "read" yetmez). Token için tercihen ayrı bir "JS Work bot" Trello hesabı kullan: webhook'ta o üyenin eylemleri döngü koruması gereği yok sayılır (kendi hesabınla Trello'da elle yapılan değişiklik de yok sayılır; saatlik uzlaştırma yine de yakalar).

**JS → Trello** (`lib/integrations/trello-push.ts`): `source_ref='trello:<kartId>'` görev değişince kart güncellenir — liste (aynı panoda: onay → `… Müşteri Onay`, teslim → `… Teslim`, üretim → atananın kişi kuyruğu yoksa `Kurulum-Baskı-Produksiyon`, iç revize → atananın `Kontrol` kuyruğu, plan → `… SM`, brief → `Bekleme Salonu`), `due` / `dueComplete`, ad (`NNN_` iş no korunur), üyeler (`config.member_ids`: çalışan → Trello üye id), arşiv/bitti → `closed=true`. Karşılığı olmayan aşama (ör. *kapsam*, Kontrol kuyruğu olmayan kişide *iç revize*) için kart yerinde kalır. Trello'dan gelen proje (`projects.source_ref='trello:board:<id>'`, içe aktarmada eklenir) içinde JS'te açılan **yeni görev** için doğru listede kart açılır ve `source_ref` göreve yazılır (atomik "pending" talebi çift kartı önler). Liste eşlemesi `config.list_map` (listId → `{board, kind, stage, person?, employee?, review?}`), içe aktarma ve saatlik uzlaştırmada yenilenir. Bir proje birden çok panodan kart içeriyorsa yeni kart ilk içe aktarılan panoya açılır.
Tetik: olay hattında otomasyondan **bağımsız** `integrationSync` adımı (`dispatchEvent` kurallardan önce çağırır; `/api/events/dispatch` cron'u 5 dakikada bir) + Supabase deposu görev yazınca tarayıcıdan best-effort satır içi `POST /api/integrations/trello/push`. İtme idempotenttir (kartta fark yoksa Trello'ya yazılmaz). Demo: Trello'ya yazılmaz, günlüğe `demo_noop` düşer.

**Döngü koruması:** Trello kaynaklı yazmalar `tasks.sync_origin='trello'` (+`synced_at`) ile işaretlenir ve olay yükünde (`payload.new.sync_origin`) görülür → geri itilmez (0008 tetikleyicisi, işarete dokunmayan JS yazmasında işareti temizler). Webhook'ta `idMemberCreator == config.token_member_id` (bağlanırken kaydedilir) eylemler yok sayılır.

**Çakışma kuralı:** son yazan kazanır — Trello `dateLastActivity` ile `tasks.updated_at` (0008 trigger'ı) karşılaştırılır; JS daha yeniyse Trello'dan gelen değişiklik, kart daha yeniyse JS'ten giden değişiklik atlanır. Uygulanan/atlanan/hatalı her işlem `integration_sync_log` tablosuna yazılır; Connect → Trello kartında **Senkron günlüğü** (son 50) ve "Son senkron · n değişiklik · m hata" satırı görünür.

**Saatlik uzlaştırma** (`/api/integrations/trello/reconcile`, `vercel.json` cron `0 * * * *`, `CRON_SECRET`; elle: Connect → *Şimdi eşitle*): `last_sync_at`'ten beri değişen kartlar çekilir, JS'te değişen görevler (ve kartsız yeni Trello-proje görevleri) itilir; Trello'da silinen/arşivlenen kartların görevi **arşive alınır**; kartı seçili panolarda bulunamayan ama silinmemiş görev `trello:vanished` etiketiyle korunur ve günlüğe yazılır.

## Görev ayrıntıları ve Trello kart özellikleri (0012)
Trello kartındaki her şey JS Work görev panelinde (ORBIT **Görev ayrıntısı**: masaüstü yan panel + mobil sheet) bulunur ve Trello ile **iki yönlü** eşitlenir; ekip Trello'yu bırakabilir. Kurulum: `0012_task_details.sql` migration'ını uygula (`tasks.description/cover`, `task_comments`, `task_checklists`, `task_check_items`, `task_attachments`, RLS, olay tetikleyicileri ve **özel Storage kovası `task-files`**; kova SQL'i `insert into storage.buckets … ('task-files', public=false, 25 MB)` + `storage.objects` politikaları migration içindedir — Dashboard → Storage'tan elle de açılabilir). **0012 uygulanmadan Trello itmesi `description,cover` sütunlarını okuyamaz; önce migration.**

| Trello kartı | JS Work (sekme) | Not |
|---|---|---|
| Açıklama (`desc`) | **Açıklama** — markdown-lite (**kalın**, *italik*, `kod`, liste, bağlantı, @anma), odak kaybında otomatik kayıt | `tasks.description`; `null` = hiç eşlenmedi (itilmez), `''` = bilerek boş |
| Checklist'ler + maddeler (durum, bitiş, üye) | **Checklist** — çoklu liste, ekle/yeniden adlandır/sil, madde ekle/işaretle/adlandır/sil, ilerleme çubuğu, madde bitişi + sorumlusu | `task_checklists` / `task_check_items`; Trello üyesi ↔ çalışan `config.member_ids` ile |
| Yorumlar (`commentCard`) | **Yorumlar** — yazar avatarı + zaman, ekle, kendi yorumunu düzenle/sil (owner/org_admin/operations hepsini), @anma düz metin | `task_comments`; Trello'dan gelenlerde `author_id` boş, yazar adı Trello adı |
| Ekler | **Dosyalar** — yükle (≤25 MB), bağlantı ekle, görsel önizleme, aç/indir (imzalı adres, 1 sa), sil | Storage `task-files/<org>/<görev>/…`; Trello'dan gelen yüklemeler sunucuda indirilip Storage'a konur, **>25 MB atlanır** (bağlantı yedeği kalır) |
| Kapak (renk / görsel ek) | **Kapak** — 10 Trello rengi ya da bir görsel ek, kaldır | `tasks.cover = {color?|attachment_id?}`; `null` = eşlenmedi, `{}` = kapak yok |
| Etkinlik | **Aktivite** — denetim kayıtları (yetki varsa) + yorum + dosya hareketleri | |
| Rozetler | Liste satırı ve pano kartında: açıklama simgesi, checklist `4/12`, yorum/ek sayısı, kapak rengi şeridi / görsel | `Repo.taskBadges()` |

**Yetki (RLS)**: okuma yalnızca iç roller (müşteri rolleri görmez); yazma owner/org_admin/operations/account/pm/creative; freelancer yalnızca kendine atanmış (ya da atanmamış) görevde (`core.can_write_task`). Yorumu yalnızca yazarı ya da owner/org_admin/operations düzenler/siler. İstemci `external_id`/`sync_origin` yazamaz (tetikleyici sıfırlar). Dosya ≤25 MB (kova sınırı + istemci denetimi).

**Trello → JS** (`trello-details.ts`, saf + port tabanlı; `external_id` ile idempotent — iki kez içe aktarmak aynı sayıda kayıt bırakır): içe aktarma / saatlik uzlaştırma kart başına `desc`, `cover`, `/cards/{id}/checklists?checkItems=all`, `/cards/{id}/actions?filter=commentCard&limit=1000`, `/cards/{id}/attachments` çeker (rozetlerden "bu kartta yok" anlaşılırsa istek atılmaz; sıralı, 429'da yeniden dener). Trello'da silinenler JS'ten kalkar (yalnızca `external_id`'si olanlar; JS'te açılmış satırlara dokunulmaz; 1000 yorumdan fazlada yorum silmesi uygulanmaz). Son yazan kazanır: JS daha yeniyse açıklama/kapak/değişmiş satır ezilmez. Tam içe aktarmada ayrıntı bütçesi 230 sn; aşılırsa kalan kartlar için içe aktarmayı tekrarla (idempotent). **Webhook** eylemleri satır bazlı uygulanır: `commentCard/updateComment/deleteComment`, `addChecklistToCard/removeChecklistFromCard`, `createCheckItem/updateCheckItemStateOnCard/deleteCheckItem`, `deleteAttachmentFromCard`; `addAttachmentToCard`, `updateCheckItem` ve üst checklist'i bilinmeyen madde eylemleri ilgili parçayı yeniden çeker; `updateCard` (açıklama/kapak) kartı yeniden çekip alanları uygular.

**JS → Trello** (`mode=two_way`): açıklama → `PUT /cards/{id}` `desc`; kapak → `PUT /cards/{id}` `cover` (Trello'nun belgelenmiş `cover` parametresi; ayrı bir `/cover` ucu kullanılmaz); yorum → `POST /cards/{id}/actions/comments`, düzenleme `PUT …/actions/{aid}/comments`, silme `DELETE`; checklist → `POST /cards/{id}/checklists`, `PUT/DELETE /checklists/{id}`; madde → `POST /checklists/{id}/checkItems`, `PUT /cards/{id}/checkItem/{iid}` (`state=complete|incomplete`, ad, bitiş, `idMember`), `DELETE`; ek → `POST /cards/{id}/attachments` (bağlantı: `url`; Storage dosyası: çok parçalı dosya, ≤25 MB), silme `DELETE`. Tetik: `task_*` olayları (`task.commented` = yorum eklendi, `<tablo>.insert|update|delete`; payload `task_id/new/old`) → `syncEvent` (cron 5 dk) + tarayıcıdan satır içi `POST /api/integrations/trello/push {details:true}` (son 3 dk olaylarını işler). Saatlik uzlaştırma Trello kartlı görevlerde `external_id`'si olmayan satırları da iter. **Döngü koruması**: Trello kaynaklı her yazma `sync_origin='trello'` (+ `synced_at=updated_at`, 0010 kuralı) taşır → geri itilmez; webhook silmeleri önce `sync_origin='trello_delete'` ile işaretlenip silinir; itme sırasında `external_id='pending:<id>'` atomik kilidi çift yorum/ek oluşmasını önler; token sahibinin kendi webhook eylemleri yok sayılır. Trello ek yeniden adlandırma API'de yok → JS'te ad değişince Trello'ya itilmez (`skipped_unsupported`). Her işlem `integration_sync_log`'a yazılır (`comment`, `checklist`, `check_item`, `attachment` varlıkları).

**Demo**: `DemoRepo` aynı Repo yüzeyini bellekte uygular (ekler nesne adresi; kalıcı değil); *Örnek veriyle dene* 1. kartta açıklama, kapak, 2 checklist (6 madde), 2 yorum, 1 ek getirir ve aynı çekirdekten (idempotent) geçer. Trello'ya yazılmaz.

### Trello'dan çıkış planı
1. **Paralel dönem** (`two_way`): ekip iki yerde de çalışabilir; Senkron günlüğündeki hata satırlarını (ör. `vanished`, listesi olmayan aşama) haftalık gözden geçir; eşlenemeyen kişileri (Connect → içe aktarma sonucu) tamamla.
2. **Sadece okuma** (`pull_only`): ekip JS'e geçmeye başladığında Trello'ya yazımı kes; Trello'da yapılan son değişiklikler JS'e akmaya devam eder.
3. **Kapat** (Connect → *Trello'yu kapat* ya da mod = Kapalı): webhook'lar silinir, senkron durur; görevler, projeler, `source_ref` bağları ve günlük **silinmez**. İstersen sonra modu tekrar açıp *Webhook kur* ile devam edebilirsin.
4. Trello panolarını Trello'da arşivle/dışa aktar; anahtarı Power-Up sayfasından iptal et.

## Bilinen eksikler
Görev ayrıntıları (0012): Trello API çağrıları (checklist/madde/yorum/ek/kapak uçları ve çok parçalı yükleme), 0012 tetikleyicileri/RLS/Storage politikaları ve `pushUnsyncedDetails` içindeki gömülü (embedded) PostgREST filtreleri gerçek Trello/Supabase'e karşı denenmedi (saf mantık + bellek portlu testler ve derleme); arayüz tarayıcıda görsel/klavye testinden geçmedi. Webhook ek ekleme/madde güncelleme eylemleri parça başına yeniden çekim yapar; Storage'a indirilen Trello ekleri Trello'da sonradan değişirse yeniden indirilmez; JS silmeleri satır içi yolda olaydan (≤3 dk) ya da cron'dan (5 dk) gider; rozet sayımları liste açılışında 100'lük gruplarla (3 sorgu/grup) okunur.
Trello senkron: JS → Trello yazımı, uzlaştırma ve 0008 tetikleyicileri gerçek Trello/Supabase'e karşı denenmedi (yalnızca saf mantık + bellek portlu testler); Trello'da JS'te karşılığı olmayan liste/aşama (kapsam, Kontrol'süz iç revize) tek yönlü kalır ve Trello'dan gelen sonraki çekim aşamayı listeye göre yeniden yazabilir; satır içi itme tarayıcıdan çağrılır (sekme kapanırsa cron 5 dk içinde tamamlar). Trello: gerçek Trello API'sine karşı uçtan uca denenmedi (anahtar yok; HTTP katmanı ve Supabase deposu yalnızca derleme/ham mantık testiyle doğrulandı), webhook'lar kart bazlı yeniden çekim yapar (artık son-yazan-kazanır: daha yeni JS düzenlemesi korunur), silinen/arşivlenen kart tam içe aktarmada arşive alınmaz (yalnızca webhook ile), 1000+ kartta tek istek/pano limiti (Trello 1000 kart sınırı) geçerlidir. 
Supabase uçtan uca doğrulanmadı (instance yok; jsonb katman, RPC (`assign_bid`, `hire_candidate`…) ve RLS/tetikleyiciler canlı DB'de test edilmedi; 0006 yalnızca statik testle doğrulandı), tarayıcıda görsel test yapılmadı, dosya yükleme/Vimeo/MinIO simüle. Demo'da API anahtarları yalnızca tarayıcıda yaşar (sunucu durumsuz; sunucu uçları demo için `jsdemo_token` kabul eder) ve demo webhook aksiyonu ağ çağrısı yapmaz. Otomasyon zincirleme tetiklemesi (bir kuralın ürettiği olayın başka kuralı tetiklemesi) demoda yok. Otomasyon `condition` ifadeleri değerlendirilmez. Cron aralığı Vercel planına bağlıdır.
