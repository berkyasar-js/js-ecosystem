/** Entegrasyonlar, MCP, özelleştirme, fiyatlandırma, güvenlik ve SSS içerikleri. Kaynak: prod/README.md, contracts, apps/web api rotaları. */

export type Status = 'live' | 'soon' | 'partial';
export const STATUS_LABEL: Record<Status, string> = { live: 'Canlı', soon: 'Yakında', partial: 'Kısmi' };

export interface IntegrationDef { id: string; name: string; status: Status; summary: string; points: string[]; note?: string }
export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'trello', name: 'Trello', status: 'live',
    summary: 'İki yönlü senkron: Trello → JS (webhook + saatlik uzlaştırma) ve JS → Trello (kart yazımı). Ekip bir süre ikisini paralel kullanır, sonra Trello’yu kapatır; veriler kalır.',
    points: [
      'Modlar: İki yönlü · Yalnızca Trello → JS · Kapalı (webhook’lar silinir, veriler korunur)',
      'Tam içe aktarma: pano → marka başına tek proje, kart → görev (idempotent, çift kayıt yok)',
      'Liste → aşama eşleme (Müşteri Onay, Teslim, Kontrol kuyruğu, Bekleme Salonu, SM takvimi)',
      'Kart ayrıntıları: açıklama, kapak, checklist’ler, yorumlar, ekler (≤25 MB Storage’a alınır)',
      'Webhook: HMAC-SHA1 (TRELLO_API_SECRET) ya da gizli anahtar; döngü koruması ve son-yazan-kazanır',
      'Senkron günlüğü: uygulanan/atlanan/hatalı her işlem; “Son senkron · n değişiklik · m hata”',
    ],
    note: 'Gerçek Trello hesabıyla uçtan uca doğrulama kurulumda yapılır (anahtar/token sizin).',
  },
  {
    id: 'hubspot', name: 'HubSpot', status: 'partial',
    summary: 'Kurulum sihirbazından özel uygulama token’ı bağlanır; yalnızca sunucuda saklanır, arayüzde maskeli görünür.',
    points: ['Token saklama ve doğrulama ekranı (setup.hubspot.* denetim kaydı)', 'Pipeline / kişi eşitleme — planlı'],
    note: 'Bugün token saklanır; HubSpot API çağrısı (eşitleme) henüz yok.',
  },
  {
    id: 'google', name: 'Google', status: 'live',
    summary: 'Google ile giriş (Supabase Auth). İzinli e-posta alan adı kısıtı yalnızca Google girişinde uygulanır.',
    points: ['Google OAuth ile oturum', 'Alan adı allowlist (security.allowed_email_domains)', 'Google Takvim eşitleme — planlı'],
  },
  {
    id: 'kolayik', name: 'Kolay İK', status: 'live',
    summary: 'Kolay İK dışa aktarımını (XLSX) JS People’a aktarma sekmesi; kurulum ekip içe aktarımı da aynı yaklaşımı kullanır.',
    points: ['XLSX tarayıcıda okunur, dosya sunucuya yüklenmez', 'Maaş/TC/telefon/e-posta/adres/SGK/banka sütunları hiç okunmaz', 'Yönetici bağları ada göre çözülür; tekrar içe aktarma çift kayıt üretmez'],
  },
  {
    id: 'email', name: 'E-posta (OTP & davet)', status: 'live',
    summary: 'E-posta kodu (OTP) ile giriş, davet, parola sıfırlama ve sihirli bağlantı — Supabase Auth şablonlarıyla.',
    points: ['OTP ile parolasız giriş', 'Yönetim panelinden davet / sihirli bağlantı', 'Resend ile bildirim e-postaları — planlı'],
  },
  {
    id: 'anthropic', name: 'Anthropic Claude', status: 'live',
    summary: 'Tüm ajanlar (Kurul, ikizler, e-posta ve stüdyo taslakları) Anthropic API üzerinden çalışır; çıktılar şemayla doğrulanır, token/maliyet kaydedilir.',
    points: ['Ajan başına prompt sürümü ve model', 'Aylık maliyet tavanı (402 ile durdurma)', 'Anahtar yoksa deterministik demo çıktısı'],
  },
  {
    id: 'webhooks', name: 'Webhook’lar', status: 'live',
    summary: 'Gelen: POST /api/webhooks/:provider, ham gövde üzerinde HMAC-SHA256 (x-jscore-signature) ya da webhooks kapsamlı API anahtarı. Giden: otomasyon aksiyonu olarak imzalı webhook.',
    points: ['Gelen imza doğrulama (sha256=…)', 'Giden webhook HMAC imzalı; özel/iç ağ adresleri reddedilir', 'Olay türleri: tasks.update, approvals.insert, invoices.update, leaves.update …'],
  },
  {
    id: 'cron', name: 'Vercel Cron', status: 'live',
    summary: 'Olay dağıtıcısı 5 dakikada bir (/api/events/dispatch), Trello uzlaştırması saatte bir (/api/integrations/trello/reconcile). CRON_SECRET ile korunur.',
    points: ['Harici zamanlayıcı ile de tetiklenebilir (HMAC ya da servis anahtarı)', 'Sıklık Vercel planına bağlıdır (Hobby’de günlük)'],
  },
  {
    id: 'gmail', name: 'Gmail → CRM', status: 'soon',
    summary: 'Gelen e-postayı markaya bağlayıp AI görev taslağına çevirme (Gelen Kutusu → E-posta sekmesi hazır; Gmail bağlantısı planlı).',
    points: ['E-posta sekmesi ve inbox_drafts ajanı mevcut', 'Gmail OAuth bağlantısı — planlı'],
  },
];

/* ───────── MCP ───────── */
/** apps/web/src/lib/mcp.ts → MCP_TOOLS ile aynı. */
export const MCP_TOOLS = [
  { name: 'project_status', desc: 'Proje(ler)in akış aşaması, görev dağılımı ve geciken işleri.', args: 'project_id? (string)' },
  { name: 'create_task_draft', desc: 'Brief aşamasında bir görev taslağı oluşturur (onay akışına girer).', args: 'project_id, title, task_type?, priority? (low|normal|high), due_at?' },
];
export const MCP_METHODS = ['initialize', 'ping', 'tools/list', 'tools/call'];
export const MCP_SCOPES = [
  { scope: 'mcp', desc: '/api/mcp uç noktası' },
  { scope: 'webhooks', desc: '/api/webhooks/:provider (HMAC yerine Bearer)' },
  { scope: 'work:read · crm:read · resources:read · finance:read · intel:read · comms:read', desc: 'Ürün bazlı okuma kapsamları (politikayla kısıtlanabilir)' },
];

/* ───────── Özelleştirme ───────── */
export interface CustomizeItem { title: string; where: string; desc: string; status: Status }
export const CUSTOMIZE: CustomizeItem[] = [
  { title: 'Modül anahtarları', where: 'Panel → Modüller & Özellikler', desc: 'Her modülü organizasyon düzeyinde aç/kapat. Kapalı modül menüden düşer, rotası Ana Sayfa’ya yönlenir; Ana Sayfa, Profil, Uygulamalar ve Onaylar kapatılamaz.', status: 'live' },
  { title: 'Özellik anahtarları', where: 'Panel → Modüller & Özellikler', desc: '<modül>.<özellik> anahtarları: Pano görünümü, ihale, yorumlar, checklist, dosyalar, AI taslakları, sağlık skorları, faturalar, marj… Kapalı özellik düğme/sekmeyi gizler; AI özellikleri sunucuda da reddedilir.', status: 'live' },
  { title: 'Rol bazlı menü & grup sırası', where: 'Panel → Organizasyon → Gezinme', desc: '9 üst alanın sırası ve rol başına gizlenen modüller (settings.nav). Bir grubun tüm modülleri gizliyse grup düşer.', status: 'live' },
  { title: 'Kurulum paketleri', where: 'Kurulum sihirbazı → Modüller', desc: 'Ajans temel · Üretim · Finans · İK · Yapay zekâ paketleri modül anahtarlarına çevrilir; paketsiz modüllere dokunulmaz.', status: 'live' },
  { title: 'Sektör paketleri', where: 'Panel → Ürünler & Paketler', desc: 'Ajans, Etkinlik, Prodüksiyon, B2B hizmet paketleri; organizasyon ayarında işaretlenir.', status: 'partial' },
  { title: 'White label', where: 'Panel → Ürünler & Paketler → White label', desc: 'Görünen ad, ana renk ve alan adı ayarı; logo URL’si kenar çubuğunda görünür. Özel alan adı yönlendirmesi kurulum hizmetiyle.', status: 'partial' },
  { title: 'Otomasyon kuralları', where: 'Panel → Otomasyonlar', desc: 'Olay (tasks.update, approvals.insert …) + eşitlik filtresi → aksiyon: görev oluştur, uygulama içi bildirim, görev aşaması, imzalı webhook. Çalıştırma günlüğü ve son tetiklenme.', status: 'live' },
  { title: 'Ajan promptları & sürümleri', where: 'Panel → Ajanlar & Maliyet', desc: 'Ajan başına aktif prompt sürümü ve model; yeni sürüm repo’daki markdown dosyalarından yüklenir (npm run prompts:sql).', status: 'live' },
  { title: 'Karar hakları & onay kuralları', where: 'Panel → Yönetim Kurulu · Onay Merkezi', desc: 'Onay türleri (içerik, bütçe, kapsam, müşteri kararı, yetki, ajan) ve kimin hangi rolü karara bağlayabileceği; kurul kararlarında kurucu vetosu.', status: 'live' },
  { title: 'Ajan politikaları (Sor / Planla / Uygula)', where: 'Panel → Ajanlar', desc: 'Ajan başına mod, aylık ₺ bütçesi ve otomatik onay kuralları. Şema hazır (agent_policies); panel arayüzü yolda.', status: 'soon' },
  { title: 'Bildirim kuralları', where: 'Organizasyon ayarları · Profil', desc: 'Olay → kanal (uygulama içi, e-posta, Slack) kuralları ve kişisel tercihler (anmalar, özet). E-posta/Slack kanalı planlı.', status: 'partial' },
  { title: 'Kayıtlı görünümler', where: 'Projeler → Görevler', desc: 'Filtre + sıralama kaydedilir, kenar çubuğuna sabitlenir (pinned_views).', status: 'live' },
  { title: 'Özel alanlar', where: '—', desc: 'Görev/proje/marka için organizasyona özel alanlar.', status: 'soon' },
  { title: 'Çalışma saatleri, dil, para birimi', where: 'Panel → Organizasyon', desc: 'tr-TR / Europe/Istanbul / TRY varsayılan; çalışma saatleri kapasite hesabına girer.', status: 'live' },
];

/* ───────── Fiyatlandırma ───────── */
export interface Plan { id: string; name: string; adminCode: string; price: string; unit: string; minSeats: string; blurb: string; cta: { label: string; href: string }; highlight?: boolean; includes: string[] }
export const PLANS: Plan[] = [
  {
    id: 'baslangic', name: 'Başlangıç', adminCode: 'Starter', price: '₺490', unit: '/ koltuk / ay', minSeats: 'En az 5 koltuk', blurb: 'Küçük ekipler için çekirdek operasyon.',
    cta: { label: 'Demo talep et', href: '/demo?plan=baslangic' },
    includes: ['Ana Sayfa, Gelen Kutusu, Projeler, Görevler, Akış, Mesajlar', 'Onay Merkezi ve otomasyon kuralları (temel)', 'Ajanlar demo modunda (deterministik çıktı)', 'Google / e-posta OTP girişi', 'E-posta desteği'],
  },
  {
    id: 'ajans', name: 'Ajans', adminCode: 'Business', price: '₺890', unit: '/ koltuk / ay', minSeats: 'En az 5 koltuk', blurb: 'Tüm modüller, Trello geçişi ve yapay zekâ kurulu.', highlight: true,
    cta: { label: 'Demo talep et', href: '/demo?plan=ajans' },
    includes: ['Tüm modüller ve özellik anahtarları', 'Trello iki yönlü senkron, HubSpot token, Kolay İK aktarımı', 'Yönetim Kurulu: haftada 1 kurul + Kurul Sohbeti', 'Ajan bütçesi dahil: ₺2.000 / ay (aşımı tavanla durdurulur)', 'MCP uç noktası ve API anahtarları', 'MFA, alan adı kısıtı, denetim kaydı', 'Öncelikli destek'],
  },
  {
    id: 'kurumsal', name: 'Kurumsal', adminCode: 'Enterprise', price: 'Teklif', unit: '', minSeats: '25+ koltuk', blurb: 'Grup ajanslar ve düzenlemeye tabi müşteriler için.',
    cta: { label: 'Bize yazın', href: '/iletisim' },
    includes: ['SSO / kurumsal kimlik sağlayıcı', 'Özel Supabase (VPC) ya da kendi sunucunuz', 'Özel modüller ve sektör paketleri', 'Sınırsız kurul; ayrı ajan bütçesi', 'SLA, DPA ve veri işleme sözleşmesi', 'Adanmış kurulum ve veri geçişi'],
  },
];
export interface CompareRow { label: string; values: [string | boolean, string | boolean, string | boolean] }
export const COMPARE: Array<{ group: string; rows: CompareRow[] }> = [
  { group: 'Çalışma alanı', rows: [
    { label: 'Projeler, görevler, akış, gelen kutusu', values: [true, true, true] },
    { label: 'CRM, müşteri portalı, teklif + PDF', values: [false, true, true] },
    { label: 'Üretim hub’ı (Studio, Social, Media, Review, Transfer, Present)', values: [false, true, true] },
    { label: 'Finans, Insights, Panolar', values: [false, true, true] },
    { label: 'People, İş yükü, Kaynaklar, Hire', values: [false, true, true] },
  ] },
  { group: 'Yapay zekâ', rows: [
    { label: 'Yönetim Kurulu (9 ajan)', values: ['Demo', 'Haftada 1 kurul', 'Sınırsız'] },
    { label: 'Kurul Sohbeti ve onay kartları', values: [false, true, true] },
    { label: 'Dijital ikizler ve görev ihalesi', values: [false, true, true] },
    { label: 'Dahil ajan bütçesi', values: ['—', '₺2.000 / ay', 'Teklife göre'] },
  ] },
  { group: 'Entegrasyon', rows: [
    { label: 'Trello iki yönlü senkron', values: [false, true, true] },
    { label: 'HubSpot, Kolay İK, webhook’lar', values: [false, true, true] },
    { label: 'MCP uç noktası ve API anahtarları', values: [false, true, true] },
  ] },
  { group: 'Güvenlik & destek', rows: [
    { label: 'Google / e-posta OTP girişi', values: [true, true, true] },
    { label: 'MFA (TOTP), alan adı kısıtı, denetim kaydı', values: ['Denetim kaydı', true, true] },
    { label: 'SSO, VPC / kendi sunucu, SLA', values: [false, false, true] },
    { label: 'Destek', values: ['E-posta', 'Öncelikli', 'Adanmış'] },
  ] },
];
export const PRICING_FAQ = [
  { q: 'Koltuk nedir?', a: 'Aktif üyelik sayısıdır. Devre dışı bırakılan üyeler koltuk saymaz. Müşteri portalı rolleri (Client Admin / Viewer) Ajans ve Kurumsal planlarda marka başına 3 kullanıcıya kadar ücretsizdir.' },
  { q: 'Ajan bütçesi nasıl çalışır?', a: 'Her ajan çalıştırması token maliyetiyle kaydedilir. Panelde aylık tavan tanımlarsınız; tavanı aşan çalıştırma durur (402) ve kurul başlığında “Bu ay ₺X / tavan ₺Y” görünür. Ajans planına ₺2.000/ay dahildir; üstü kullanım başına faturalanır.' },
  { q: 'Yıllık ödeme indirimi var mı?', a: 'Evet, yıllık ödemede %20 indirim uygulanır (panelde dönem “Yıllık” seçilince hesap otomatik güncellenir).' },
  { q: 'Modül bazlı alabilir miyim?', a: 'Panel → Ürünler & Paketler’de kapalı modüller faturaya yansımaz; modül bazlı tarife Kurumsal planda teklifle belirlenir.' },
  { q: 'Deneme süresi?', a: 'Demo modunda uygulamayı veritabanı bağlamadan deneyebilirsiniz. Canlı deneme için 14 günlük pilot kurulum talep edin.' },
  { q: 'Fiyatlar KDV dahil mi?', a: 'Hayır. Tüm fiyatlar lansman fiyatıdır, KDV hariçtir ve TRY cinsindendir.' },
];

/* ───────── Güvenlik ───────── */
export const SECURITY: Array<{ title: string; desc: string; detail: string }> = [
  { title: 'Satır düzeyi güvenlik (RLS)', desc: 'Her sorgu kullanıcının JWT’si ile Postgres’e gider; organizasyon, rol ve kapsam politikaları veritabanında uygulanır.', detail: 'Repo katmanı → Supabase istemcisi → RLS. İzin tablosu (contracts) demo, test ve RLS SQL için tek kaynaktır.' },
  { title: 'Rol & kapsam modeli', desc: '14 rol (Owner’dan Client Viewer’a), ürün:kaynak:eylem izinleri ve own/team/brand/org kapsamları.', detail: 'Bordro ve özlük arşivi Owner için bile varsayılan kapalıdır; açık yetki ister.' },
  { title: 'MFA (TOTP)', desc: 'Panelden zorunlu kılınabilir: kullanıcı QR ile kaydolmadan ya da kod girmeden uygulamaya giremez.', detail: 'Arayüz kapısıdır; Supabase MFA → TOTP açık olmalıdır. MFA sıfırlama yöneticidedir.' },
  { title: 'E-posta alan adı kısıtı', desc: 'Google ile girişte alan adı izinli listede değilse oturum kapatılır.', detail: 'E-posta kodu (OTP) girişi davetle kontrol edilir.' },
  { title: 'Denetim kaydı', desc: 'Her yönetim eylemi (başarı ve hata) admin.* önekiyle; modül yazmaları ve entegrasyon senkronu ayrı günlüklerde.', detail: 'Eylem / sonuç / tarih / kaynak filtresi, “yalnızca yönetim” görünümü, JSON dışa aktarma.' },
  { title: 'Servis rolü yalnızca sunucuda', desc: 'Supabase servis anahtarı istemciye hiç inmez; yönetim rotaları requireAdmin() ile korunur.', detail: 'Entegrasyon sırları (Trello, HubSpot) sütun düzeyinde gizlidir; arayüzde maskeli görünür.' },
  { title: 'API anahtarları', desc: 'Yalnızca sha256 özeti saklanır; kapsam, son kullanma ve iptal denetimi her istekte.', detail: 'Politika: en uzun ömür ve izinli kapsamlar panelden kısıtlanır.' },
  { title: 'Webhook imzaları', desc: 'Gelen istekler ham gövde HMAC-SHA256 ile doğrulanır; giden webhook’lar imzalanır.', detail: 'Özel/iç ağ adreslerine giden webhook reddedilir (SSRF koruması).' },
  { title: 'Veri konumu', desc: 'Veritabanı, kimlik ve dosya depolama tek Supabase projesinde; bölge AB (Frankfurt) olarak kurulur.', detail: 'Kurumsal planda özel VPC ya da kendi sunucunuz. Mevcut dağıtımın bölgesi kurulum sırasında teyit edilir.' },
  { title: 'KVKK', desc: 'Veri sorumlusu sizsiniz; JS Workspace veri işleyen olarak DPA imzalar. Ekip içe aktarımında maaş/TC/telefon sütunları hiç okunmaz.', detail: 'Silme/anonimleştirme talepleri için üyelik kaldırma ve dışa aktarma araçları paneldedir.' },
  { title: 'Yedekleme', desc: 'Supabase günlük otomatik yedekleme (plan düzeyine göre PITR); JSON dışa aktarma panelden.', detail: 'Kendi sunucunuzda kurulumlarda yedekleme planı kurulum hizmetinin parçasıdır.' },
  { title: 'Güvenlik başlıkları', desc: 'nosniff, strict referrer, X-Frame-Options: DENY; oturum süresi panelden.', detail: 'Üç uygulama da aynı başlık politikasıyla dağıtılır.' },
];

/* ───────── SSS ───────── */
export const FAQ: Array<{ group: string; items: Array<{ q: string; a: string }> }> = [
  { group: 'Genel', items: [
    { q: 'JS Workspace nedir?', a: 'Ajanslar için tek çalışma alanı: projeler, görevler, CRM, üretim, ekip, finans ve dokuz kişilik yapay zekâ yönetim kurulu. Kullanıcı uygulaması, Ana Yönetim Paneli ve Ters Mühendislik Stüdyosu olmak üzere üç uygulamadan oluşur.' },
    { q: 'Trello’dan geçiş ne kadar sürer?', a: 'Bağlantı + tam içe aktarma dakikalar içinde biter. Ekip bir süre iki aracı paralel kullanır (iki yönlü senkron), sonra “yalnızca Trello → JS” ve “kapalı” moduna geçilir. Veriler, projeler ve günlük silinmez.' },
    { q: 'Veritabanı bağlamadan deneyebilir miyim?', a: 'Evet. Demo modunda veri tarayıcınızda (localStorage) yaşar; üstte “Demo modu” bandı görünür. Rol seçerek tüm ekranları gezebilirsiniz.' },
    { q: 'Mobilde çalışır mı?', a: 'Uygulama duyarlıdır: mobilde 5 alt sekme (Ana Sayfa, Gelen Kutusu, Projeler, Mesajlar, Uygulamalar), görev ayrıntısı sheet olarak açılır.' },
  ] },
  { group: 'Yapay zekâ', items: [
    { q: 'Ajanlar kendi başına değişiklik yapar mı?', a: 'Varsayılan olarak hayır. Kurul planı bir onay kartına düşer; onaylanınca uygulanır. Uygula (otomatik) modu üst sınırlı olarak tanımlanır ve her çalıştırma günlüğe yazılır.' },
    { q: 'Hangi model kullanılıyor?', a: 'Anthropic Claude. Ajan başına model panelden seçilir; çıktılar zod şemasıyla doğrulanır, geçersiz çıktı uygulanmaz.' },
    { q: 'Maliyeti nasıl kontrol ederim?', a: 'Aylık USD tavanı (₺ karşılığı kurla gösterilir). Tavan aşılınca çalıştırmalar durur; panelde ay içi harcama çubuğu ve çalıştırma günlüğü var.' },
    { q: 'Verilerim modele eğitim için gider mi?', a: 'Hayır. API üzerinden yapılan çağrılar Anthropic’in API veri politikasına tabidir; eğitimde kullanılmaz.' },
  ] },
  { group: 'Güvenlik & veri', items: [
    { q: 'Veriler nerede tutulur?', a: 'Supabase (Postgres, Auth, Storage) — AB bölgesi. Kurumsal planda özel VPC ya da kendi sunucunuz.' },
    { q: 'MFA zorunlu kılabilir miyim?', a: 'Evet, Panel → Güvenlik’ten. Kullanıcı TOTP kaydı olmadan uygulamaya giremez.' },
    { q: 'Müşterilerim neyi görür?', a: 'Yalnızca kendi markalarının açık işleri, onayları, talepleri ve dosyaları. Client Admin onay verebilir, Client Viewer yalnızca izler.' },
  ] },
  { group: 'Kurulum & destek', items: [
    { q: 'Kurulum kaç adım?', a: 'Sihirbaz 6 adım: Organizasyon → Ekip (XLSX) → Modüller (paketler) → Entegrasyonlar → İlk marka & proje → Özet. Yeniden açılabilir.' },
    { q: 'Kendi sunucumda kurabilir miyim?', a: 'Evet. Açık kaynak değildir; lisans + kurulum hizmeti ile kendi Vercel/Supabase hesabınıza ya da VPC’nize kurulur.' },
    { q: 'MCP ile Claude Desktop’tan bağlanabilir miyim?', a: 'Evet. mcp kapsamlı bir API anahtarı oluşturun; /api/mcp JSON-RPC uç noktasına Bearer ile bağlanın. Örnek yapılandırma MCP sayfasında.' },
  ] },
];
