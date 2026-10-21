import type { Metadata } from 'next';
import { NewAnalysis } from '@/components/new-analysis';
import { PageHeader } from '@/components/ui';
import { access } from '@/lib/data';

export const metadata: Metadata = { title: 'Yeni analiz' };

export default async function NewPage() {
  const a = await access();
  if (!a.ok) return null;
  return (
    <>
      <PageHeader eyebrow="Yeni analiz" title="Bir özelliği çözmeye başla" sub="Hedefi seç, tek bir özellik sor. REA kanıtı çıkarır; yapay zekâ akışa çevirir." />
      <NewAnalysis demo={a.actor.mode === 'demo'} />
    </>
  );
}
