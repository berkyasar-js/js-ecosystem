import type { Metadata } from 'next';
import { PageHero, Prose, Section } from '@/components/ui';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'Gizlilik politikası (taslak)', robots: { index: false }, alternates: { canonical: '/gizlilik' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Gizlilik" title="Gizlilik politikası" lede={<><span className="chip chip-warn mr-2">Taslak</span>Bu metin yer tutucudur; yayın öncesi hukuk danışmanınızca gözden geçirilmelidir.</>} />
      <Section className="py-4"><Prose>
        <h2>1. Veri sorumlusu</h2><p>{SITE.company}, bu web sitesi ({SITE.url}) için veri sorumlusudur. JS Workspace uygulamasında işlenen müşteri verileri bakımından veri sorumlusu abone kuruluştur; {SITE.company} veri işleyendir.</p>
        <h2>2. Bu sitede toplanan veriler</h2><p>Demo talep formunda verdiğiniz ad, e-posta, ajans adı, koltuk sayısı ve mesaj yalnızca sizinle iletişim kurmak için işlenir. Site üçüncü taraf analitik ya da reklam çerezi kullanmaz.</p>
        <h2>3. Saklama</h2><p>Demo talepleri en fazla 12 ay saklanır; talebinizle daha erken silinir.</p>
        <h2>4. Haklarınız</h2><p>KVKK m.11 kapsamındaki haklarınız için <a href={`mailto:${SITE.email}`}>{SITE.email}</a> adresine başvurabilirsiniz.</p>
        <h2>5. Değişiklikler</h2><p>Bu metin güncellendiğinde tarih bu sayfada belirtilir. Son güncelleme: taslak.</p>
      </Prose></Section>
    </>
  );
}
