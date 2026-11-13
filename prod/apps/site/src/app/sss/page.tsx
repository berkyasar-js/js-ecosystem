import type { Metadata } from 'next';
import { CtaBand, Faq, PageHero, Section } from '@/components/ui';
import { FAQ } from '@/content/platform';

export const metadata: Metadata = { title: 'Sık sorulan sorular', description: 'JS Workspace hakkında genel, yapay zekâ, güvenlik ve kurulum soruları.', alternates: { canonical: '/sss' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="SSS" title="Sık sorulan sorular" lede="Burada yoksa sorun: demo talebinde ya da iletişim sayfasında." />
      {FAQ.map((g) => <Section key={g.group} title={g.group} className="py-6 md:py-8"><div className="max-w-3xl"><Faq items={g.items} /></div></Section>)}
      <CtaBand />
    </>
  );
}
