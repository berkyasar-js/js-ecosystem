'use client';
import Link from 'next/link';
import { Async, Empty, PageHeader, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { ProjectWorkspace } from '@/components/work/ProjectWorkspace';

/** Yalnızca owner / org_admin: ORBIT çalışma yüzeyinin gerçek repo verisiyle (ilk proje) izole önizlemesi. */
export default function ThemePreview() {
  const { me } = useSession();
  const q = useData(async (r) => (await r.listProjects())[0] ?? null);
  const allowed = !!me && (me.role === 'owner' || me.role === 'org_admin');
  return (
    <>
      <PageHeader eyebrow="Tasarım önizleme" title="ORBIT çalışma yüzeyi" sub="İlk projenin gerçek verisiyle liste, pano, ayrıntı paneli, yeni görev penceresi ve bildirimler. Değişiklikler gerçek repo'ya yazılır." actions={<Link className="btn" href="/app/overview">← Genel bakış</Link>} />
      {!me ? null : !allowed ? <div className="card max-w-2xl text-sm text-muted" role="note">Bu önizleme yalnızca owner ve org_admin rolleri içindir.</div> : (
        <Async q={q}>{(p) => !p ? <Empty>Önizlenecek proje yok.</Empty> : <ProjectWorkspace projectId={p.id} backHref={null} />}</Async>
      )}
    </>
  );
}
