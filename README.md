# JS Ecosystem — v0.7 prototip

Jobs Studio ajans işletim sistemi web prototipi. Statik site; derleme gerektirmez. Dış bağımlılık yoktur (PDF yazıcı dahil). 25 modül + Zekâ katmanı (29 ekran), rol bazlı demo giriş.
Bu dal (`js-ecosystem`) korelio-app'ten bağımsızdır; yalnızca Vercel dağıtımı için kullanılır.

## v0.4 · V6 tasarım tabanı
- Plus Jakarta Sans (OFL, `assets/fonts/`), koyu bento yüzeyler, cam kenarlar, lime/cyan/magenta süreç vurguları (`assets/v6.css`).
- Glass Gradient mini güncelleme 1.0 (`assets/glass-gradient-update.css`, `body.os-v2` kapsamı).
- Varsayılan tema koyu; açık tema Profilim/Ayarlar › Görünüm'den.

## v0.5 · Akış Kontrolü + ekran tamamlama
- `assets/modules-flow.js` + `assets/flow.css`: Akış Kontrolü (4 aşamalı timeline, kapılı devir, geçmiş, plan doğrulama, versiyon/karar, yeniden açma), Proje 360 timeline kartı, Resources › Kişi × proje aşaması + kapasite düzenleme.
- `assets/modules-ext2.js`: Studio, Social, Media, Review, Transfer, Present, Marketing, Events (command center), Hire (KVKK), Portal, Insights sekmeleri; akış 7.2, 7.4, 7.5.
- `assets/modules-ext3.js`: Automation, Connect, Onay Merkezi, Admin (14 rol matrisi), Marketplace sekmeleri.
- Yükleme sırası: app → ops → media → people → hr → ext → flow → ext2 → ext3. Depolama anahtarı `js-ecosystem-v6` (v0.5 ve öncesi veri sürüm uyuşmazlığında sıfırlanır).

## v0.6 · V6 tamamlama, rol matrisi, PWA
- **Orbit Studio**: `assets/orbit-studio.svg` Genel Bakış hero kartında ve demo girişte dekoratif (aria-hidden) nesne; `prefers-reduced-motion` altında animasyon yok.
- **Portre avatarlar**: `assets/team-portraits.jpg` (2x2 sprite, 4 portre). **Bu portreler yapay zekâ ile üretilmiş kurgusal kişilerdir; gerçek çalışanları veya kişileri temsil etmez.** `avatar(id)` (app.js) kimlik -> portre eşlemesini deterministik yapar (sabit tablo + bilinmeyen kimlikler için kimlik karması); 10 kişiye 4 yüz düştüğü için bazı yüzler tekrar eder. `<img alt>` ile gelir, yüklenemezse baş harfler görünür. Kullanım: Akış Kontrolü, Proje 360, Resources seçici ve ısı haritası, People kartları, üst bar/yan çubuk, Profilim, Onay Merkezi.
- **V4-V6 bileşenleri** `assets/v6.css` içinde: signal-card, cam araç çubukları, flow dossier kısayolları, seçili aşama gradyanı, neon düğme durumları (`.pending` "Kaydediliyor…", `.locked` "Yetki gerekli"), mobilde 2 sütunlu aşama düzeni. Koyu/açık tema kontrast denetimi yapıldı.
- **Gelen Kutusu**: "Göreve dönüştür" öncesi iç not, sonrasında "Oluşturulan göreve git"; işlenmiş e-postada "zaten dönüştürüldü" rozeti.
- **Akış kapısı**: İç onay -> Teslim için projeye bağlı bütün onaylar (bütçe, kapsam dışı dahil) Onaylandı olmalı; engelleyenler türüne göre listelenir.
- **Rol matrisi uygulaması**: `can('can.…')` (Admin > Roles & Permissions Matrix, `state.rolePerms`) Finans gider onayı, Payroll Vault, özlük arşivi, Connect Bağlan/Kes, davet, proje/görev düzenleme için canlı geçerlidir. Yetkisiz düğmeler `.locked` + "Yetki gerekli" ve tıklamada toast. Owner/Admin varsayılan olarak bordro/özlük arşivi izni almaz. Anahtarlar: can.view.project, can.edit.task, can.approve.expense, can.read.payroll, can.read.hr_archive, can.manage.integrations, can.invite.users.
- **PWA**: `manifest.webmanifest`, `sw.js` (önbellek `jse-v6`; statikler cache-first, index.html network-first; yalnız https veya localhost'ta kayıt), `assets/icons/`. Profilim > Güvenlik ve mobil Hesabım ekranında "Uygulamayı yükle"; `offline` olayında banner.

## v0.7 · dış sayfalar, gerçek PDF, kanban sürükle-bırak, TR/EN, erişilebilirlik
- **Depolama** `js-ecosystem-v7` (v0.6 ve öncesi veri sürüm uyuşmazlığında sıfırlanır), önbellek `jse-v7`, üst çubuk rozeti "v0.7 · prototip". Yükleme sırası: `i18n.js` → `shared.js` → `pdf.js` → app → modüller → `v7.js`.
- **Dış sayfalar** (oturum yok, ana CSS + `assets/shared.js` ortak durum okuyucusu; hepsi "Demo bağlantı — kimlik doğrulama değildir"):
  - `watch.html?t=<token>` müşteri inceleme sayfası. Tohum token'lar: `wellana-v03` (Wellana film v3, indirme kapalı), `anova-v02` (Anova film v2, indirme açık); `eski0001` süresi dolmuş örnek. Bilinmeyen/süresi dolmuş/iptal: "Bağlantı geçersiz veya süresi dolmuş". Video yer tutucu oynatıcı (poster + zaman kodu çubuğu), yalnızca müşteri-görünür yorumlar, zaman kodlu yorum ekleme, Onayla (not isteğe bağlı) / Revizyon iste (not zorunlu), revize turu sayacı (2 dahil), son kullanma ve indirme yetkisi durumu.
  - `apply.html?job=<id>` aday portalı (örn. `ps1`); `apply.html` işsiz açılırsa açık pozisyon listesi. Ad, e-posta, portfolyo linki, CV dosya adı (dosya yüklenmez), KVKK aydınlatma onayı zorunlu, saklama/silme talebi notu. Başvuru Hire › Aday havuzu "Başvuru" kolonuna düşer; takip kodu ile durum sorgulanır.
  - `portal.html?token=anova-demo` müşteri portalı sihirli bağlantı özeti.
  - **Veri akışı**: dış sayfalar ana durumu (localStorage) yalnızca okur; yazma `js-ecosystem-v7-queue` kuyruğuna gider. Ana uygulama açılışta, `storage` olayında ve sekme görünür olunca kuyruğu içe alır (yorum, onay/revizyon → Review ve Onay Merkezi, başvuru → Hire; audit'e yazılır). Ana uygulama hiç açılmadıysa dış sayfalar gömülü tohumu kullanır. Bu gerçek kimlik doğrulama değildir; tarayıcıya özel demo mekanizmasıdır.
  - Uygulama içi bağlantılar: Review › Dış inceleyici linki (tam URL + Kopyala/Aç, link oluştur/iptal `state.extLinks`), Hire › Career page builder (apply bağlantıları), Transfer › Recipient view (demo notu).
  - `vercel.json` `cleanUrls` açık (`/watch?t=…`); `sw.js` yeni sayfaları önbelleğe alır, sayfa yanıtları kendi anahtarıyla saklanır.
- **PDF** (`assets/pdf.js`, bağımlılıksız): yalnızca metin, A4, çok sayfa, Helvetica/Helvetica-Bold, `/Encoding /WinAnsiEncoding`. **Not:** WinAnsi'de ğ Ğ ş Ş İ ı yoktur; g G s S I i olarak yazılır (ç ö ü Ç Ö Ü korunur, ₺ "TL" olur). Kullanım: CRM teklif (kalemler, toplam, vade, sürüm), Present aylık rapor, Insights haftalık özet, Finance fatura taslağı, People özlük belge listesi (+ tek belge indirme). Blob ile indirilir; CSV dışa aktarımları korunur.
- **Kanban sürükle-bırak** (CRM lead hunisi ve Görevler Kanban'ı, 8 kolon): işaretçi olaylarıyla sürükleme; klavye: kart odakta iken Boşluk seç, ←/→ kolon, Enter bırak, Esc vazgeç (ekran okuyucu duyurusu). `can.edit.task` kilidi geçerlidir (kilitli iken taşımaz, toast + audit). Audit'e "Kanban sürükle-bırak/klavye" yazılır. Dar ekran/dokunmatikte mevcut taşı düğmeleri kullanılır.
- **TR/EN**: `t(key)` kabuk sözlüğü + `tx()/txe()` modül başlığı eşlemesi (`assets/i18n.js`); modül gövde metni sözlükte yoksa Türkçe kalır. Ayarlar › Genel ve Profilim'de "Dil" seçimi `state.lang`/`settings.general.lang` içine yazılır, `<html lang>` güncellenir, tarih/para `Intl` ile seçilen yerele göre biçimlenir.
- **Erişilebilirlik (WCAG 2.2 AA temel)**: tüm diyaloglar `role=dialog aria-modal`, başlığa bağlı, odak tuzağı, Esc ile kapanır, odak geri döner; yan menü `<nav aria-label>`; alt sekmeler `tablist/tab/tabpanel` + ok/Home/End; ikon düğmelere `aria-label`; kanban kartları odaklanabilir; rozetlerde yalnız renk yerine simge (✓ ! ×); atla bağlantısı; kontrast düzeltmeleri (`assets/v7.css`).
