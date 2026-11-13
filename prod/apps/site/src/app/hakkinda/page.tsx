import type { Metadata } from 'next';
import Link from 'next/link';
import { CtaBand, Feature, PageHero, Section } from '@/components/ui';
import { IconArrow } from '@/components/icons';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'Hakkında — Jobs Studio', description: 'JS Workspace, İstanbul merkezli kreatif ajans Jobs Studio’nun kendi operasyonu için geliştirdiği çalışma alanının ürünleşmiş hâlidir.', alternates: { canonical: '/hakkinda' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Hakkında" title="Bir ajansın içinde doğdu" lede="JS Workspace, Jobs Studio’nun kendi işini yürütmek için kurduğu JS Ecosystem’in ticari adıdır. Önce Trello panolarımız, kota tablolarımız ve haftalık yönetim toplantılarımız vardı; sonra hepsini tek çalışma alanına ve dokuz kişilik bir yapay zekâ kuruluna taşıdık."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Tanışalım <IconArrow size={16} /></Link><Link href="/iletisim" className="btn btn-lg">İletişim</Link></>} />
      <Section eyebrow="İlkeler" title="Nasıl geliştiriyoruz">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature title="Önce kendi işimizde">Her modül önce Jobs Studio’nun gerçek projelerinde, gerçek müşterilerle çalışır. Trello geçişi, kota aşımı onayı ve kurul kararları oradan çıktı.</Feature>
          <Feature title="Onay kapılı yapay zekâ">Ajanlar öneri üretir; insanlar karar verir. Her çalıştırma maliyetiyle günlüğe düşer, tavan aşılınca durur.</Feature>
          <Feature title="Tek kaynak">İzinler, modüller ve özellik anahtarları tek bir sözleşme paketinde tanımlıdır; arayüz, API, demo, test ve veritabanı politikaları aynı tablodan beslenir. Bu sitedeki katalog da oradan üretilir.</Feature>
        </div>
      </Section>
      <Section eyebrow="Künye" title="Jobs Studio">
        <div className="prose">
          <p>{SITE.company} — İstanbul merkezli kreatif ajans ve yazılım stüdyosu. JS Workspace, Ana Yönetim Paneli ve Ters Mühendislik Stüdyosu Jobs Studio tarafından geliştirilir ve işletilir.</p>
          <p>E-posta: <a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
