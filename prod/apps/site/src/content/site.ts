/** Site geneli sabitler. */
export const SITE = {
  name: 'JS Workspace',
  tagline: 'Ajanslar için yapay zekâ destekli çalışma alanı',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://js-workspace-site.vercel.app',
  appUrl: 'https://js-ecosystem-app.vercel.app',
  loginUrl: 'https://js-ecosystem-app.vercel.app/login',
  adminUrl: 'https://js-ecosystem-admin.vercel.app',
  reaUrl: 'https://js-rea-studio.vercel.app',
  company: 'Jobs Studio',
  email: 'hello@jobsstudio.com.tr',
};

export const NAV: Array<{ label: string; href: string; children?: Array<{ label: string; href: string; desc: string }> }> = [
  {
    label: 'Ürün', href: '/urun', children: [
      { label: 'Genel bakış', href: '/urun', desc: 'Tek çalışma alanı, dokuz üst alan' },
      { label: 'Projeler & Görevler', href: '/urun/projeler', desc: 'Pano, akış, görev ayrıntısı' },
      { label: 'Kurul & Ajanlar', href: '/urun/kurul', desc: '9 kişilik yapay zekâ yönetim kurulu' },
      { label: 'CRM', href: '/urun/crm', desc: 'Pipeline, markalar, teklifler, portal' },
      { label: 'Üretim', href: '/urun/uretim', desc: 'Studio, Social, Media, Review, Transfer, Present' },
      { label: 'Ekip', href: '/urun/ekip', desc: 'People, iş yükü, kaynaklar, ikizler' },
      { label: 'Finans', href: '/urun/finans', desc: 'Bütçe, fatura, marj, raporlar' },
      { label: 'Yönetim Paneli', href: '/urun/yonetim-paneli', desc: 'Modüller, roller, güvenlik, denetim' },
      { label: 'REA Stüdyosu', href: '/urun/rea', desc: 'Ters mühendislik ile taşıma planı' },
    ],
  },
  { label: 'Modüller', href: '/moduller' },
  { label: 'Entegrasyonlar', href: '/entegrasyonlar' },
  { label: 'MCP', href: '/mcp' },
  { label: 'Özelleştirme', href: '/ozellestirme' },
  { label: 'Fiyatlandırma', href: '/fiyatlandirma' },
  { label: 'Güvenlik', href: '/guvenlik' },
];

export const FOOTER_GROUPS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
  { title: 'Ürün', links: [
    { label: 'Genel bakış', href: '/urun' }, { label: 'Modüller', href: '/moduller' }, { label: 'Kurul & Ajanlar', href: '/urun/kurul' },
    { label: 'Yönetim Paneli', href: '/urun/yonetim-paneli' }, { label: 'REA Stüdyosu', href: '/urun/rea' }, { label: 'Fiyatlandırma', href: '/fiyatlandirma' },
  ] },
  { title: 'Platform', links: [
    { label: 'Entegrasyonlar', href: '/entegrasyonlar' }, { label: 'MCP bağlantısı', href: '/mcp' }, { label: 'Özelleştirme', href: '/ozellestirme' }, { label: 'Güvenlik', href: '/guvenlik' }, { label: 'SSS', href: '/sss' },
  ] },
  { title: 'Şirket', links: [
    { label: 'Hakkında', href: '/hakkinda' }, { label: 'İletişim', href: '/iletisim' }, { label: 'Demo talep et', href: '/demo' }, { label: 'Gizlilik', href: '/gizlilik' }, { label: 'Kullanım koşulları', href: '/kosullar' },
  ] },
];
