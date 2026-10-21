import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Empty, PageHeader, StatusChip, fmtDate } from '@/components/ui';
import { access } from '@/lib/data';
import { TARGET_LABELS } from '@/lib/types';

export const metadata: Metadata = { title: 'Projeler' };

export default async function ProjectsPage() {
  const a = await access();
  if (!a.ok) return null;
  const projects = await a.store.listProjects(a.actor.orgId);
  return (
    <>
      <PageHeader eyebrow="Ters Mühendislik Stüdyosu" title="Projeler" sub="Her proje bir uygulamanın tek bir özelliğini çözmek için açılır: hedef, soru, çalışma ve bulgular."
        actions={<Link className="btn btn-primary" href="/projeler/yeni"><Plus size={16} aria-hidden />Yeni analiz</Link>} />
      {a.actor.mode === 'demo' && <div className="callout info mb-4"><b>Demo modu.</b> Aşağıdaki örnek, rehberdeki Wispr Flow incelemesidir. Kendi projelerin sunucu yeniden başlayınca silinir; kalıcı kayıt için Supabase bağla.</div>}
      {projects.length === 0 ? <Empty>Henüz proje yok. <Link className="text-button" href="/projeler/yeni">İlk analizi başlat</Link></Empty> : (
        <>
          <div className="card" style={{ padding: 8 }}>
            <table className="table proj-table">
              <thead><tr><th>Proje</th><th>Hedef</th><th>Soru</th><th>Durum</th><th>Oluşturuldu</th></tr></thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td><Link className="name" href={`/projeler/${p.id}`}>{p.name}</Link></td>
                    <td>{TARGET_LABELS[p.target_kind]}</td>
                    <td><div className="q" title={p.question}>{p.question || '—'}</div></td>
                    <td><StatusChip status={p.status} />{p.has_finding && <span className="chip chip-lime" style={{ marginLeft: 6 }}>Bulgu</span>}</td>
                    <td>{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="proj-cards" style={{ padding: 8 }}>
              {projects.map((p) => (
                <Link key={p.id} href={`/projeler/${p.id}`} className="nested" style={{ display: 'grid', gap: 6 }}>
                  <strong>{p.name}</strong>
                  <span className="sub">{TARGET_LABELS[p.target_kind]} · {fmtDate(p.created_at)}</span>
                  {p.question && <span className="sub">{p.question}</span>}
                  <span><StatusChip status={p.status} /></span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
