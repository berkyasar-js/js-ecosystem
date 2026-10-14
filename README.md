# JS Ecosystem — v0.5 prototip

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
- Yükleme sırası: app → ops → media → people → hr → ext → flow → ext2 → ext3. Depolama anahtarı `js-ecosystem-v5`.
