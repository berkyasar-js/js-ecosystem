# @jscore/rea — Jobs Studio · Ters Mühendislik Stüdyosu

REA (`rea-agents`, MIT) ile bir uygulamanın tek bir özelliğinin nasıl çalıştığını kanıtıyla çıkarır, yapay zekâ ile akışa çevirir ve JS Ecosystem'e **taşıma planı** (markdown) üretir. Next.js 15 App Router, TypeScript strict, Tailwind v4, V6 tasarım belirteçleri; arayüz Türkçe.

## Özellikler
- **Projeler**: hedef türü (Web sitesi URL / Electron-JS paketi `.asar`/`.zip` ≤ 45 MB / Bilgisayarımda), özellik sorusu, durum.
- **Analiz çalıştırma**: `POST /api/projects/[id]/run` (maxDuration 300) REA'yı `child_process` ile çalıştırır; ilerleme `rea.runs` satırına yazılır, arayüz `/api/runs/[id]` ile yoklar.
- **Bulgular**: özellik akışı (dosya, işlev/mesaj adı, 2–3 satır snippet), "REA'nın göremediği yerler", "ayrı çalışan yardımcı program var mı", **AI sentez** (`claude-sonnet-5-5`, zorunlu tool-use JSON şeması).
- **JS Ecosystem'e taşı**: deterministik Türkçe plan (modül, veri modeli, ekran, API, izinler, riskler, efor); kopyala / `.md` indir.
- **Rehber**: rehberin özeti + kopyalanabilir komutlar.
- **Demo modu**: Supabase env yoksa bellekte çalışır; rehberdeki Wispr Flow örneği hazır gelir (yükleme kapalı, URL analizi açık).

## REA CLI (6.7.0) ve kullanımı
| Komut | Kullanım |
|---|---|
| `analyze-javascript-application <asar\|dizin> --json` | paket / zip / indirilen web scriptleri |
| `inspect-analysis-view <istek.json>` (`{source:{kind:'inline',evidence}, view:{kind:'summary'}}`) | özet görünümü |
| `trace-application-feature` (`{application:<kanıt>, seed:{kind,value,match:'exact'}}`) | rehberde anlatılır; sunucuda çağrılmaz, yerine paket kaynağında anahtar kelime araması yapılır |
| `analyze-web-bundle`, `list-browser-targets` | Chrome (CDP) gerekir; yalnızca "Bilgisayarımda" komutlarında |

Sunucuda tarayıcı yoktur: URL modu sayfayı ve script dosyalarını (SSRF korumalı) indirip dizin olarak statik analiz eder.

## Kurulum
```bash
npm install                      # repo kökünde (workspaces: apps/*)
npm run dev -w apps/rea          # http://localhost:3100
npm run build -w apps/rea
npm run typecheck -w apps/rea && npm run lint -w apps/rea && npm run test -w apps/rea
```
Node ≥ 22.19 (REA şartı).

### Ortam değişkenleri
| Ad | Açıklama |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | boşsa DEMO modu |
| `SUPABASE_SERVICE_ROLE_KEY` | sunucu: arka plan işçisi, imzalı yükleme URL'si, Storage okuma |
| `ANTHROPIC_API_KEY` | AI sentez |
| `REA_BIN` | (isteğe bağlı) `rea.mjs` yolu |

### Veritabanı
`packages/schema/supabase/migrations/0013_rea.sql` elle çalıştırılır: `rea.projects/runs/findings`, RLS (`core.has_role`, owner/org_admin), özel `rea-uploads` bucket (45 MiB). Sonra Supabase → Settings → API → **Exposed schemas** listesine `rea` ekle. Erişim için `public.memberships` rolü `owner` ya da `org_admin` olmalı. Auth web uygulamasıyla aynı (Google / e-posta kodu); `/auth/callback` adresini Supabase redirect listesine ekle.

## Vercel
- Root Directory `apps/rea`, Install Command `cd ../.. && npm install`, Framework Next.js, Node 22.x.
- Env değişkenlerini gir. 300 sn fonksiyon süresi için Pro plan gerekir.
- `next.config.ts` `rea-agents`'i external tutar ve analiz route'una dosya olarak ekler (`outputFileTracingIncludes`, izleme kökü repo kökü).

## Sınırlar
- Yükleme 45 MB: Vercel gövde sınırı 4,5 MB olduğundan dosya tarayıcıdan imzalı URL ile doğrudan Storage'a gider. Daha büyük asar (Wispr Flow çıktısı ~59 MB) için "Bilgisayarımda" modu; yüklenen REA JSON'u da ≤ 45 MB olmalı.
- Analiz en çok ~300 sn; REA dosya başı zaman aşımı 200 sn. Büyük asar bu sürede bitmeyebilir. Zip açılmış boyut ≤ 450 MB; `/tmp` sınırı ~512 MB.
- Ham kanıt ≤ 5 MB ise `rea.runs.evidence`'a yazılır; büyükse yalnızca özet + kanıt listesi saklanır.
- URL modu: girişli sayfalar, sonradan yüklenen kod ve ağ trafiği görünmez; en çok 40 script / 14 MB.
- Yalnızca JS/Electron/web; Hopper/Ghidra/adb gerektiren analizler yerelde.
- Fonksiyon ölürse takılı çalışma ~6 dk sonra "hata" işaretlenir.
- SSRF: iç ağ adresleri ve yönlendirmeler DNS çözümlemesiyle engellenir (DNS rebinding'e karşı tam garanti yok).

## Hukuki not
Yalnızca öğrenmek için kullanın; bulunan kodu kopyalamayın, kullanım koşullarına bakın, şifre/lisans/güvenlik önlemi aşmayın. Yeni analiz formu bunun onayını ister.
