# JS Ecosystem — üretim temeli

Next.js 15 (App Router) + Supabase (Postgres/RLS/Auth/Realtime) + Anthropic. Repo kökündeki statik prototip **değiştirilmez**; her şey `prod/` altındadır.

```
prod/
  apps/web              Next.js 15, TS strict, Tailwind v4 (tokenlar CSS değişkeni), @dnd-kit, lucide
  packages/contracts    Role/Permission tipleri, modül kataloğu, tablo tipleri, zod şemaları
  packages/schema       supabase/migrations/0001..0004 + seed (CSV) — bkz. packages/schema/README.md
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
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (yalnızca sunucu), `ANTHROPIC_API_KEY`, `JSCORE_WEBHOOK_SECRET`.
5. **Vercel**: repo'yu içe aktar → **Root Directory = `prod/apps/web`** (framework otomatik Next.js; `vercel.json` gerekmez). "Include source files outside of the Root Directory" **açık** olmalı (workspace paketi `@jscore/contracts` için); Install Command: `cd ../.. && npm install`.
6. İlk kullanıcıyı `memberships`'e owner olarak ekle (schema README, adım 6).

## Mimari notları
- **Repo katmanı** (`lib/repo`): `Repo` arayüzü; `SupabaseRepo` (browser/server Supabase istemcisi, her sorgu kullanıcının JWT'si ile → RLS), `DemoRepo` (bellek/localStorage). Sunucuda `getRepo()`, istemcide `createClientRepo()`.
- **Yetki**: `contracts` içinde `hasPermission(role, product, resource, action)`; Owner/Org Admin için `payroll` ve `hr_archive` varsayılan kapalı. Onay kararı kuralı `canDecideApproval` hem UI'da hem repo/API'de, RLS'te de karşılığı var.
- **Ajanlar**: `/api/agents/run` → aktif `agent_prompts` → Anthropic → zod doğrulama → `agent_runs` (token/maliyet). Demo/anahtarsız modda deterministik çıktı. Kota kuralı (`lib/quota.ts`): sözleşme kotası aşan taslak "kapsam dışı" onayına gider.
- **Webhook**: `POST /api/webhooks/:provider`, ham gövde üzerinde HMAC-SHA256 (`x-jscore-signature: sha256=…`). **MCP**: `POST /api/mcp` JSON-RPC (`tools/list`, `tools/call`: `project_status`, `create_task_draft`), `Authorization: Bearer` → `access_tokens.token_hash`.

## Bilinen eksikler
Bkz. ana rapor: kalan modüller scaffold sayfası, Supabase uçtan uca doğrulama yapılmadı (instance yok), aylık ajan maliyet tavanı henüz zorlanmıyor, token oluşturma UI'ı yok, ihale (bids) tablosu yok.
