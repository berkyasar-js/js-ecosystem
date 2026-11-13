import type { Metadata } from 'next';
import Link from 'next/link';
import { NAV_GROUPS, MODULES } from '@jscore/contracts';
import { HeroMock } from '@/components/mockups';
import { CtaBand, Feature, PageHero, Section } from '@/components/ui';
import { IconArrow } from '@/components/icons';
import { PRODUCT_PAGES } from '@/content/product';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'Ürün — Tek çalışma alanı, dokuz üst alan', description: 'JS Workspace ürün turu: Ana Sayfa, Gelen Kutusu, Projeler, Müşteriler, Üretim, Ekip, Finans, Mesajlar, Uygulamalar ve Ana Yönetim Paneli.', alternates: { canonical: '/urun' } };

const APPS = [
  { name: 'Kullanıcı uygulaması', url: SITE.appUrl, desc: 'Ekibin günlük çalıştığı yer: 9 üst alan, Spotlight, Sor, görev ayrıntısı, müşteri portalı.' },
  { name: 'Ana Yönetim Paneli', url: SITE.adminUrl, desc: 'Yalnızca owner / org_admin: modüller, kullanıcılar, güvenlik, denetim, Kurul, entegrasyonlar.' },
  { name: 'Ters Mühendislik Stüdyosu', url: SITE.reaUrl, desc: 'Mevcut aracınızın bir özelliğini analiz edip JS Workspace’e taşıma planı üretir.' },
];

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Ürün" title="Uzun modül listesi yerine dokuz üst alan" lede="Kenar çubuğu Ana Sayfa · Gelen Kutusu · Projeler · Müşteriler · Üretim · Ekip · Finans · Mesajlar · Uygulamalar. Alt sekmeler grubun altında açılır; modül URL’leri değişmez. Bir grubun tüm modülleri kapalıysa grup düşer."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><a href={SITE.loginUrl} className="btn btn-lg" rel="noopener">Demo modunda dene</a></>}>
        <div className="glow relative mt-12 rounded-[18px]"><HeroMock /></div>
      </PageHero>

      <Section eyebrow="Bilgi mimarisi" title="Dokuz alan, alt sekmeler ve modüller">
        <div className="grid gap-3 md:grid-cols-3">
          {NAV_GROUPS.map((g) => (
            <div key={g.id} className="card">
              <div className="flex items-center justify-between"><h3 className="text-lg">{g.label}</h3><code className="text-xs text-muted">{g.href}</code></div>
              {g.children.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">{g.children.map((c) => <li key={c.href} className="chip">{c.label}</li>)}</ul>
              ) : <p className="mt-3 text-sm text-muted">{MODULES.find((m) => m.id === g.modules[0])?.desc}</p>}
              {g.mobile && <p className="mt-3 text-xs text-muted">Mobil alt sekmede</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Alanlar" title="Ürünü yakından inceleyin">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_PAGES.map((p) => (
            <Link key={p.slug} href={`/urun/${p.slug}`} className="card flex flex-col gap-2 transition hover:border-brand-ink/50">
              <span className="eyebrow">{p.eyebrow}</span>
              <span className="text-lg font-semibold">{p.title}</span>
              <span className="text-sm text-muted">{p.lede.slice(0, 140)}…</span>
              <span className="mt-auto text-sm text-brand-ink">İncele →</span>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Üç uygulama" title="Aynı Supabase, üç ayrı yüzey">
        <div className="grid gap-4 md:grid-cols-3">{APPS.map((a) => <Feature key={a.name} title={a.name}>{a.desc} <a className="text-brand-ink underline" href={a.url} rel="noopener">{a.url.replace('https://', '')}</a></Feature>)}</div>
      </Section>

      <Section eyebrow="Her yerde" title="Spotlight, Sor ve karşılama">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature title="Spotlight (⌘K / Ctrl+K)">Alanlar, sayfalar, görevler (derin bağlantı), projeler, markalar, kişiler ve hızlı eylemler: “Yeni görev”, “Yeni proje”, “Kurulum sihirbazı”, “Kurulu aç”.</Feature>
          <Feature title="Sor (⌘J / Ctrl+J)">Yerel veriden kurallı yanıt: bugün teslim, gecikenler, kim yoğun, bekleyen onaylar, “Acme ne durumda”. LLM çağrısı yapmaz; owner için Kurul Sohbeti bağlantısı.</Feature>
          <Feature title="Karşılama & kurulum">İlk girişte profil, bildirim tercihleri ve role göre “ilk 3 adım”. Owner için 6 adımlı, yeniden girilebilir kurulum sihirbazı.</Feature>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
