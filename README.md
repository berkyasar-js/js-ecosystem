# JS Ecosystem — v0.6 prototip

Jobs Studio ajans işletim sistemi web prototipi. Statik site; derleme gerektirmez. 25 modül + Zekâ katmanı (29 ekran), rol bazlı demo giriş.
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
