/** Ürün alt sayfaları — tek şablon (ProductPage) ile üretilir. İçerik, prod/README.md ve contracts kataloğundan derlendi. */
export interface ProductFeature { title: string; desc: string; soon?: boolean }
export interface ProductPageData {
  slug: string;
  eyebrow: string;
  title: string;
  lede: string;
  /** Uygulamadaki rota ipucu (gösterim amaçlı). */
  route: string;
  modules: string[];
  features: ProductFeature[];
  /** Çalışma akışı adımları. */
  flow: Array<{ step: string; detail: string }>;
  /** Kimler görür (contracts ROLE_LABELS anahtarları). */
  roles: string[];
  /** Mockup türü. */
  mock: 'board' | 'chat' | 'pipeline' | 'grid' | 'people' | 'finance' | 'admin' | 'rea';
  related: Array<{ label: string; href: string }>;
}

export const PRODUCT_PAGES: ProductPageData[] = [
  {
    slug: 'projeler', eyebrow: 'Projeler', title: 'Projeler, pano ve akış — tek yerde', route: '/app/projects · /app/tasks · /app/flow · /app/mywork',
    lede: 'Proje şablonları, 8 aşamalı Kanban, aşama planı ve görev ayrıntısı. Trello’dan gelen her kart, açıklaması, checklist’i, yorumu ve ekiyle birlikte burada yaşar.',
    modules: ['projects', 'tasks', 'flow', 'mywork', 'requests', 'agenda'],
    features: [
      { title: '8 aşamalı akış', desc: 'Brief → Kapsam → Plan → Üretim → İç revize → Onay → Teslim → Arşiv. Her aşamanın sahibi ve bitişi var; darboğazlar Akış ekranında görünür.' },
      { title: 'Görev ayrıntısı', desc: 'Açıklama (markdown-lite, @anma), çoklu checklist, yorumlar, dosyalar (≤25 MB, imzalı adres), kapak ve aktivite — masaüstünde yan panel, mobilde sheet.' },
      { title: 'Görevlerim & odak', desc: 'Kişinin bugünü, gecikenleri, zaman girişi ve günlük planı; Ajanda’da gün/hafta görünümü.' },
      { title: 'Talepler → görev', desc: 'Hata, fikir, brief ve müşteri talepleri triyaj edilir, tek tıkla göreve dönüşür; markanın alan sahibine düşer.' },
      { title: 'Kilometre taşları & kayıtlı görünümler', desc: 'Projede kilometre taşı; sık kullanılan filtreler kayıtlı görünüm olarak kenar çubuğuna sabitlenir.' },
      { title: 'Ajan ihalesi', desc: 'Görevi “İhaleye aç”: dijital ikizler güven ve süre teklifi verir; yüksek öncelikte atama onaya gider.' },
      { title: 'Spotlight (⌘K) ve Sor (⌘J)', desc: 'Sayfalar, görevler, projeler, kişiler ve hızlı eylemler tek aramada; “bugün ne teslim?” gibi sorulara yerel veriden kurallı yanıt.' },
    ],
    flow: [
      { step: 'Brief gelir', detail: 'Gelen Kutusu’ndan, talepten ya da Trello kartından görev açılır.' },
      { step: 'Plan & atama', detail: 'Aşama planı, sorumlu, süre; istenirse ikiz ihalesi.' },
      { step: 'Üretim & revize', detail: 'Checklist, yorum, dosya; kapasite İş yükü ekranında.' },
      { step: 'Onay & teslim', detail: 'Onay Merkezi’nden karar; Trello’ya da yansır.' },
    ],
    roles: ['owner', 'org_admin', 'operations', 'account', 'pm', 'creative', 'freelancer'],
    mock: 'board',
    related: [{ label: 'Trello iki yönlü senkron', href: '/entegrasyonlar#trello' }, { label: 'Modül kataloğu', href: '/moduller' }],
  },
  {
    slug: 'kurul', eyebrow: 'Kurul & Ajanlar', title: 'Dokuz kişilik yapay zekâ yönetim kurulu', route: 'Yönetim Paneli → Yönetim Kurulu · Kurul Sohbeti',
    lede: 'CHAIR, CEO, CFO, COO, CMO, CTO, CHRO, CCO ve CLO. Haftalık kurul paketi, kurucu kararları (EVET / HAYIR / ERTELE) ve iş planı üreten Kurul Sohbeti — hepsi onay kapılı ve bütçe tavanlı.',
    modules: ['board', 'twins', 'automations'],
    features: [
      { title: '9 ajan, tek masa', desc: 'Her ajanın kendi prompt sürümü, modeli ve çıktı şeması var (zod ile doğrulanır). Kurul paketi CHAIR tarafından toplanır.' },
      { title: 'Kurul Sohbeti', desc: 'Markdown/metin dosyası ekleyerek konu açın; CHAIR yapılandırılmış plan döner: görev dağılımı, yapılacaklar, kilometre taşları, riskler, kurucuya açık sorular.' },
      { title: 'Onay kartları', desc: 'Plan “uygulansın mı?” sorusu bir onay kaydıdır (action_type=agent). Onaylanınca görevler, kilometre taşları ve proje üyeleri yazılır; iz kaydı tutulur.' },
      { title: 'Ajan modları: Sor · Planla · Uygula', desc: 'Sor (salt okunur), Planla (onayla uygula), Uygula (otomatik, üst sınırlı). Ajan başına aylık ₺ bütçesi ve otomatik onay kuralları için politika şeması hazır.', soon: true },
      { title: 'Maliyet tavanı', desc: 'Aylık ajan tavanı (USD; ₺ karşılığı kurla gösterilir). Tavanı aşan çalıştırma 402 ile durur; panelde “Bu ay ₺X / tavan ₺Y” çubuğu.' },
      { title: 'Dijital ikizler', desc: 'Kişi ve rol ikizleri; kapasite tahmini ve görev ihalesi. İkiz, sahibinin onayı olmadan devreye girmez; opt-out her zaman mümkün.' },
      { title: 'Operasyon ajanları', desc: 'inbox_drafts (e-posta → görev taslağı), studio_draft (AI konsept), twin_bid (teklif) — hepsi özellik anahtarıyla sunucuda da kapatılabilir.' },
    ],
    flow: [
      { step: 'Soru sor ya da kurulu topla', detail: 'Kurul Sohbeti’nde konu + dosya; ya da haftalık paket.' },
      { step: 'Kurul tartışır', detail: 'Ajanlar görüş ve öneri üretir; CHAIR planı derler.' },
      { step: 'Kurucu karar verir', detail: 'EVET / HAYIR / ERTELE; plan onay kartına düşer.' },
      { step: 'Plan uygulanır', detail: 'Görevler ve kilometre taşları projeye yazılır; maliyet günlüğe.' },
    ],
    roles: ['owner', 'org_admin'],
    mock: 'chat',
    related: [{ label: 'Anthropic Claude entegrasyonu', href: '/entegrasyonlar#anthropic' }, { label: 'Ajan promptları & karar hakları', href: '/ozellestirme' }],
  },
  {
    slug: 'crm', eyebrow: 'Müşteriler', title: 'CRM: pipeline’dan müşteri portalına', route: '/app/crm · /app/portal',
    lede: 'Hesaplar, markalar, kişiler, fırsatlar, teklif ve sözleşmeler. Account 360 ile marka sağlığı; müşteri portalında açık işler, onaylar ve dosyalar.',
    modules: ['crm', 'portal', 'present'],
    features: [
      { title: 'Pipeline kanbanı', desc: 'Lead’den sözleşmeye fırsat aşamaları; HubSpot token’ı kurulumdan bağlanır.' },
      { title: 'Markalar & Account 360', desc: 'Marka başına hesap sahibi, art direktör, metin yazarı, aylık kota ve sağlık skoru; uyum bayrakları.' },
      { title: 'Teklif + PDF', desc: 'Teklif belgesi sunucuda PDF olarak üretilir; Present ile sunum ve aylık rapor şablonları.' },
      { title: 'Müşteri portalı', desc: 'Client Admin / Client Viewer rolleri yalnızca kendi markalarını görür: açık işler, onaylar, talepler, dosyalar, anketler.' },
      { title: 'Hızlı oluşturma', desc: 'Müşteri + marka + ilk proje tek formda; kurulum sihirbazının 5. adımı.' },
      { title: 'Gmail → CRM → AI taslak', desc: 'Gelen e-postayı markaya bağlayıp görev taslağına çevirme akışı; Gmail bağlantısı planlı.', soon: true },
    ],
    flow: [
      { step: 'Lead', detail: 'Fırsat açılır, sahibi atanır.' },
      { step: 'Teklif', detail: 'Teklif belgesi + PDF; onay akışı.' },
      { step: 'Sözleşme & kota', detail: 'Aylık kota; kota aşımı “kapsam dışı” onayına gider.' },
      { step: 'Portal', detail: 'Müşteri işleri ve onayları portaldan izler.' },
    ],
    roles: ['owner', 'org_admin', 'operations', 'account', 'finance', 'client_admin', 'client_viewer'],
    mock: 'pipeline',
    related: [{ label: 'HubSpot', href: '/entegrasyonlar#hubspot' }, { label: 'Finans', href: '/urun/finans' }],
  },
  {
    slug: 'uretim', eyebrow: 'Üretim', title: 'Üretim hub’ı: Studio’dan Present’a', route: '/app/uretim',
    lede: 'Kreatif üretimin her adımı ortak sekme şeridinde: Studio, Social, Media, Review, Transfer, Present, Marketing ve Events.',
    modules: ['studio', 'social', 'media', 'review', 'transfer', 'present', 'marketing', 'events'],
    features: [
      { title: 'JS Studio', desc: 'Brand Memory, brief, AI konsept taslağı (AI Composer) ve sürümler.' },
      { title: 'JS Social', desc: 'Marka × ay içerik takvimi, pipeline ve kota takibi; Trello’daki “Kasım’26 SM” kartları sm:2026-11 etiketiyle buraya düşer.' },
      { title: 'JS Media', desc: 'Vimeo metadata, MinIO/S3 dosyaları ve saklama süreleri (depolama bağlantıları kurulum gerektirir).' },
      { title: 'JS Review', desc: 'Zaman kodlu yorum, sürüm, revize turu ve onay.' },
      { title: 'JS Transfer', desc: 'Yükleme, süreli paylaşım linki, indirme logu, dosya isteme.' },
      { title: 'JS Present', desc: 'Teklif belgesi, sunum taslağı, aylık rapor ve şablonlar.' },
      { title: 'Marketing & Events', desc: 'Segmentler, mailing, bülten ve huni; run-of-show, tedarikçi, saha kontrolü, LCV ve bütçe.' },
    ],
    flow: [
      { step: 'Brief & konsept', detail: 'Studio’da Brand Memory ile taslak.' },
      { step: 'Üretim & takvim', detail: 'Social takvimi, Media kütüphanesi.' },
      { step: 'Revize & onay', detail: 'Review’da zaman kodlu tur; Onay Merkezi.' },
      { step: 'Teslim', detail: 'Transfer ile süreli link; Present ile rapor.' },
    ],
    roles: ['owner', 'org_admin', 'operations', 'account', 'pm', 'creative', 'freelancer', 'client_admin'],
    mock: 'grid',
    related: [{ label: 'Özellik anahtarları', href: '/ozellestirme' }, { label: 'Modül kataloğu', href: '/moduller' }],
  },
  {
    slug: 'ekip', eyebrow: 'Ekip', title: 'Kişiler, iş yükü, kaynaklar ve ikizler', route: '/app/people · /app/workload · /app/resources · /app/twins · /app/hire',
    lede: 'Personel kartından kapasite ısı haritasına, işe alımdan dijital ikizlere: ekip tarafının tamamı. Maaş ve özlük alanları varsayılan kapalı; yalnızca açık yetkiyle görünür.',
    modules: ['people', 'workload', 'resources', 'twins', 'hire'],
    features: [
      { title: 'JS People (HRIS)', desc: 'Personel kartı, izin, zimmet, imza seti, onboarding ve devir; özlük arşivi ayrı yetkiyle.' },
      { title: 'Ekipler & hiyerarşi', desc: 'Ekip adı, yönetici (döngü korumalı), organizasyon ağacı; kurulumda XLSX ile içe aktarma — maaş/TC/telefon sütunları hiç okunmaz.' },
      { title: 'İş yükü', desc: 'Kişi başına haftalık kapasite, planlanan iş ve gecikmeler; Ana Sayfa “Ekip nabzı” kartı.' },
      { title: 'JS Resources', desc: 'Kapasite ısı haritası, izin, beceri, ekipman, zimmet ve freelancer rate card.' },
      { title: 'Dijital İkizler', desc: 'Kişi ve rol ikizleri; kapasite tahmini ve görev ihaleleri (onay kapılı).' },
      { title: 'JS Hire', desc: 'Açık pozisyonlar, aday kanbanı, puan formu, teklif ve herkese açık başvuru sayfası (/apply/[job]).' },
      { title: 'Kolay İK aktarımı', desc: 'Kolay İK dışa aktarımından (XLSX) içe aktarma sekmesi.' },
    ],
    flow: [
      { step: 'Ekibi içe aktar', detail: 'XLSX ya da elle; yönetici bağları çözülür.' },
      { step: 'Kapasiteyi gör', detail: 'İş yükü ve ısı haritası.' },
      { step: 'İkizleri onayla', detail: 'Sahibi onaylar, opt-out serbest.' },
      { step: 'İşe al', detail: 'Pozisyon → aday → teklif → personel kartı.' },
    ],
    roles: ['owner', 'org_admin', 'operations', 'hr', 'payroll', 'pm'],
    mock: 'people',
    related: [{ label: 'Kolay İK', href: '/entegrasyonlar#kolayik' }, { label: 'Güvenlik & roller', href: '/guvenlik' }],
  },
  {
    slug: 'finans', eyebrow: 'Finans', title: 'Teklif, bütçe, fatura, marj — ve raporlar', route: '/app/finance · /app/insights',
    lede: 'Ajans finansının operasyonla aynı veriden beslenmesi: bütçe, gider, tedarikçi, fatura, tahsilat, marj ve şirket defteri; Insights’ta satış hunisi, kapasite, kârlılık ve müşteri sağlığı.',
    modules: ['finance', 'insights', 'dashboards'],
    features: [
      { title: 'Bütçe & gider', desc: 'Proje bütçesi, gider kalemleri, satın alma talepleri, tedarikçiler.' },
      { title: 'Faturalar & tahsilat', desc: 'Fatura ve tahsilat sekmesi; özellik anahtarıyla gizlenebilir (finance.invoices).' },
      { title: 'Marj & şirket defteri', desc: 'Proje marjı, maliyet oranları ve şirket defteri (finance.margin, finance.ledger).' },
      { title: 'JS Insights', desc: 'Satış hunisi, kapasite, proje kârlılığı, müşteri sağlığı ve veri kalitesi raporları.' },
      { title: 'Panolar', desc: 'Görev, gecikme, iş yükü, marka sağlığı, onay ve ajan maliyeti grafikleri; Ana Sayfa’ya sabitlenebilir.' },
      { title: 'Bordro (ayrı yetki)', desc: 'Bordro rolü ve payroll ürünü; owner için bile varsayılan kapalı, açık yetki ister.' },
    ],
    flow: [
      { step: 'Teklif', detail: 'CRM’den teklif + PDF.' },
      { step: 'Bütçe', detail: 'Proje bütçesi ve kota.' },
      { step: 'Fatura', detail: 'Fatura & tahsilat; onay akışı.' },
      { step: 'Marj & rapor', detail: 'Kârlılık ve panolar.' },
    ],
    roles: ['owner', 'org_admin', 'finance', 'payroll', 'auditor'],
    mock: 'finance',
    related: [{ label: 'Fiyatlandırma', href: '/fiyatlandirma' }, { label: 'Güvenlik', href: '/guvenlik' }],
  },
  {
    slug: 'yonetim-paneli', eyebrow: 'Ana Yönetim Paneli', title: 'Yönetim, kullanıcı arayüzünden ayrı', route: 'js-ecosystem-admin · yalnızca owner / org_admin',
    lede: 'Modül ve özellik anahtarları, kullanıcılar ve roller, güvenlik politikaları, denetim kaydı, organizasyon ve kurulum sihirbazı tek panelde. Kapı sunucuda servis rolüyle uygulanır; her yönetim eylemi denetim kaydına yazılır.',
    modules: ['admin', 'marketplace', 'automations', 'integrations', 'board'],
    features: [
      { title: 'Modüller & Özellikler', desc: 'Her modülü aç/kapat (feature_flags) + modül içi özellik anahtarları (feature_toggles). Kapalı modül menüden düşer; kapalı özellik düğme/sekmeyi gizler, AI özellikleri sunucuda da zorlanır.' },
      { title: 'Kullanıcılar & Roller', desc: '14 rol; e-posta daveti (rol + çalışan + müşteri kapsamı), devre dışı bırakma (auth ban + oturum iptali), parola sıfırlama, sihirli bağlantı, MFA sıfırla. Son owner korunur.' },
      { title: 'Güvenlik', desc: 'MFA zorunluluğu (TOTP), oturum süresi, Google girişi için izinli e-posta alan adları, API anahtarı politikası (en uzun ömür + izinli kapsamlar).' },
      { title: 'Denetim kaydı', desc: 'audit_events (eylem/sonuç/tarih/kaynak filtresi) ve entegrasyon senkron günlüğü.' },
      { title: 'Organizasyon', desc: 'Ad, slug, dil/saat dilimi/para birimi, çalışma saatleri, logo; gezinme düzeni (grup sırası + rol başına gizleme); JSON dışa aktarma (sırlar/maaş/özlük hariç).' },
      { title: 'Kurulum sihirbazı', desc: '6 adım: Organizasyon → Ekip → Modüller (paketler) → Entegrasyonlar → İlk marka & proje → Özet. Yeniden açılabilir.' },
      { title: 'Entegrasyonlar & Otomasyonlar', desc: 'Trello kartı, MCP sunucuları, API anahtarları, webhook’lar; olay → aksiyon kuralları ve çalıştırma günlüğü.' },
      { title: 'Ajanlar & Maliyet', desc: 'Aylık tavan, kur, varsayılan model, prompt sürümleri, çalıştırma günlüğü.' },
    ],
    flow: [
      { step: 'Kur', detail: 'Sihirbazla organizasyon ve ekip.' },
      { step: 'Aç/kapat', detail: 'Paketler ve özellik anahtarları.' },
      { step: 'Davet et', detail: 'Rol ve kapsamla kullanıcılar.' },
      { step: 'İzle', detail: 'Sağlık, maliyet, denetim.' },
    ],
    roles: ['owner', 'org_admin'],
    mock: 'admin',
    related: [{ label: 'Özelleştirme', href: '/ozellestirme' }, { label: 'Güvenlik', href: '/guvenlik' }],
  },
  {
    slug: 'rea', eyebrow: 'Ters Mühendislik Stüdyosu', title: 'Mevcut aracınızı JS Workspace’e taşıma planı', route: 'js-rea-studio',
    lede: 'REA (rea-agents, MIT) ile bir uygulamanın tek bir özelliğinin nasıl çalıştığını kanıtıyla çıkarır, yapay zekâ ile akışa çevirir ve JS Workspace’e taşıma planı (markdown) üretir.',
    modules: [],
    features: [
      { title: 'Hedef türleri', desc: 'Web sitesi URL’si (sunucuda SSRF korumalı statik analiz), Electron/JS paketi (.asar/.zip ≤45 MB) ya da “Bilgisayarımda” komutları.' },
      { title: 'Bulgular', desc: 'Özellik akışı (dosya, işlev/mesaj adı, 2–3 satır snippet), REA’nın göremediği yerler, ayrı çalışan yardımcı program var mı.' },
      { title: 'AI sentez', desc: 'Zorunlu tool-use JSON şeması ile Claude; çıktı deterministik Türkçe plana dönüşür.' },
      { title: 'Taşıma planı', desc: 'Modül, veri modeli, ekran, API, izinler, riskler, efor — kopyala ya da .md indir.' },
      { title: 'Demo modu', desc: 'Supabase olmadan bellekte; rehberdeki örnek proje hazır gelir.' },
    ],
    flow: [
      { step: 'Hedefi seç', detail: 'URL, paket ya da yerel.' },
      { step: 'Özelliği sor', detail: '“Kısayol nasıl kayıt başlatıyor?”' },
      { step: 'Analiz', detail: 'REA CLI + kanıt.' },
      { step: 'Plan', detail: 'JS Workspace taşıma planı.' },
    ],
    roles: ['owner', 'org_admin'],
    mock: 'rea',
    related: [{ label: 'Kendi sunucunda kur', href: '/fiyatlandirma#on-prem' }, { label: 'Demo talep et', href: '/demo' }],
  },
];

export const productPage = (slug: string) => PRODUCT_PAGES.find((p) => p.slug === slug);
