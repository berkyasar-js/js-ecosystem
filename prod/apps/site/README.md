# @jscore/site — JS Workspace pazarlama sitesi

JS Workspace'in (JS Ecosystem'in ticari adı) herkese açık ürün/satış sitesi. Next.js 15 App Router, TypeScript strict, Tailwind v4, V6 tasarım belirteçleri (`apps/web/src/app/globals.css` ile aynı renkler ve Plus Jakarta Sans). Türkçe.

Tüm sayfalar statik üretilir (SSG). Tek dinamik uç `/api/demo` (demo talebi iletimi); bu yüzden `output: 'export'` kullanılmaz.

## Sayfalar
`/` · `/urun` (+ `/urun/projeler`, `/urun/kurul`, `/urun/crm`, `/urun/uretim`, `/urun/ekip`, `/urun/finans`, `/urun/yonetim-paneli`, `/urun/rea`) · `/moduller` · `/entegrasyonlar` · `/mcp` · `/ozellestirme` · `/fiyatlandirma` · `/guvenlik` · `/sss` · `/demo` · `/hakkinda` · `/iletisim` · `/gizlilik` · `/kosullar` (taslak) · `sitemap.xml` · `robots.txt` · `og.svg`.

Modül kataloğu, özellik anahtarları, kurulum paketleri, roller ve gezinme grupları **`@jscore/contracts`'tan** okunur (`MODULES`, `FEATURES`, `SETUP_PACKS`, `ROLE_MODULES`, `NAV_GROUPS`, `ROLE_GRANTS`); contracts değişince site otomatik güncellenir. Diğer metinler `src/content/*.ts` içindedir.

## Yerel
```bash
cd prod && npm install
npm run dev:site            # http://localhost:3200
npm run build --workspace=@jscore/site
npm run typecheck --workspace=@jscore/site && npm run lint --workspace=@jscore/site
```

## Vercel dağıtımı
| Ayar | Değer |
|---|---|
| Proje | `js-workspace-site` |
| Root Directory | `prod/apps/site` (monorepo kökü `prod` ise `apps/site`) |
| Install Command | `cd ../.. && npm install` |
| Framework | Next.js (otomatik) |
| Node | 22.x |
| "Include source files outside of the Root Directory" | **Açık** (workspace paketi `@jscore/contracts`) |

### Ortam değişkenleri (hepsi isteğe bağlı)
| Ad | Açıklama |
|---|---|
| `DEMO_WEBHOOK_URL` | Demo formunun JSON olarak iletileceği adres (Formspree, Slack webhook, Make/Zapier, kendi uç noktanız). Yoksa talep saklanmaz; sunucu günlüğüne yazılır ve arayüz e-posta yedeğini gösterir. |
| `NEXT_PUBLIC_SITE_URL` | Canonical/sitemap/OG için site adresi (varsayılan `https://js-workspace-site.vercel.app`). |

Webhook'a giden gövde: `{ source, received_at, name, email, company, seats, message, plan, consent }`.
