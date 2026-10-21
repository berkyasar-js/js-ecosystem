import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { DeleteProject } from '@/components/project-actions';
import { ProjectTabs } from '@/components/project-tabs';
import { PageHeader, StatusChip } from '@/components/ui';
import { access } from '@/lib/data';
import { TARGET_LABELS } from '@/lib/types';

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access();
  if (!a.ok) return null;
  const p = await a.store.getProject(a.actor.orgId, id);
  if (!p) notFound();
  return (
    <>
      <Link href="/projeler" className="text-button" style={{ marginBottom: 8 }}><ChevronLeft size={16} aria-hidden />Projeler</Link>
      <PageHeader eyebrow={TARGET_LABELS[p.target_kind]} title={p.name} sub={p.question || undefined} actions={<><StatusChip status={p.status} /><DeleteProject id={p.id} name={p.name} /></>} />
      <ProjectTabs id={p.id} />
      {children}
    </>
  );
}
