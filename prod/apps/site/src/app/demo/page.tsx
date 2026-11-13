import type { Metadata } from 'next';
import { DemoForm } from '@/components/demo-form';
import { Check, PageHero, Section } from '@/components/ui';
import { PLANS } from '@/content/platform';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'Demo talep et', description: '30 dakikalık çevrim içi demo: kendi Trello panonuz ve ekip listenizle JS Workspace’i deneyin.', alternates: { canonical: '/demo' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const p = PLANS.find((x) => x.id === plan);
  return (
    <>
      <PageHero eyebrow="Demo" title="30 dakikada kendi verinizle görün" lede={p ? `${p.name} planı için demo talebi. Formu doldurun, 1 iş günü içinde dönelim.` : 'Formu doldurun; Trello panonuzu ve ekip listenizi (XLSX) demoda birlikte içe aktaralım.'} />
      <Section className="pt-0">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <DemoForm plan={p?.id} />
          <aside className="grid gap-4 self-start">
            <div className="card">
              <h2 className="text-lg">Demoda neler var</h2>
              <ul className="mt-3 grid gap-2">
                <Check>Trello panonuzdan örnek içe aktarma ve iki yönlü senkron</Check>
                <Check>Kurul Sohbeti ile gerçek bir sorunuza plan</Check>
                <Check>Rol bazlı görünüm: yönetici, kreatif, müşteri</Check>
                <Check>Yönetim Paneli: modül anahtarları, güvenlik, denetim</Check>
                <Check>Fiyat ve geçiş planı</Check>
              </ul>
            </div>
            <div className="card">
              <h2 className="text-lg">Beklemek istemiyorsanız</h2>
              <p className="mt-2 text-sm text-muted">Uygulama demo modunda veritabanı bağlamadan çalışır; rol seçip tüm ekranları gezebilirsiniz.</p>
              <a href={SITE.loginUrl} className="btn mt-3" rel="noopener">Demo modunu aç</a>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
