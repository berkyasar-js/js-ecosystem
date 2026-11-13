import type { Metadata } from 'next';
import Link from 'next/link';
import { Feature, PageHero, Section } from '@/components/ui';
import { IconArrow, IconMail } from '@/components/icons';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'İletişim', description: 'Demo, teklif, kendi sunucunda kurulum ve destek için Jobs Studio ile iletişime geçin.', alternates: { canonical: '/iletisim' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="İletişim" title="Yazın, 1 iş günü içinde dönelim" lede="Demo için formu kullanın; teklif, kendi sunucunda kurulum ve ortaklık için e-posta yeterli."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><a href={`mailto:${SITE.email}`} className="btn btn-lg"><IconMail size={16} /> {SITE.email}</a></>} />
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          <Feature title="Satış & demo"><a className="text-brand-ink underline" href={`mailto:${SITE.email}?subject=JS%20Workspace%20demo`}>{SITE.email}</a><br />Konu: “JS Workspace demo”</Feature>
          <Feature title="Kurumsal & kendi sunucunda kurulum"><a className="text-brand-ink underline" href={`mailto:${SITE.email}?subject=Kurumsal%20teklif`}>{SITE.email}</a><br />Koltuk sayısı ve altyapı tercihinizi yazın.</Feature>
          <Feature title="Güvenlik bildirimi"><a className="text-brand-ink underline" href="mailto:security@jobsstudio.com.tr">security@jobsstudio.com.tr</a><br />72 saat içinde yanıt.</Feature>
        </div>
        <p className="mt-6 text-sm text-muted">{SITE.company} · İstanbul · Çalışma saatleri 09:00–18:00 (Europe/Istanbul)</p>
      </Section>
    </>
  );
}
