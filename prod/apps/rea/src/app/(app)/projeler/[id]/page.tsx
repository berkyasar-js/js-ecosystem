import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommandBlock } from '@/components/copy';
import { EditQuestion } from '@/components/project-actions';
import { RunPanel } from '@/components/run-panel';
import { fmtBytes, fmtDate } from '@/components/ui';
import { access } from '@/lib/data';
import { buildLocalCommands } from '@/lib/rea/requests';

export const metadata: Metadata = { title: 'Genel durum' };
export const dynamic = 'force-dynamic';

const STAT_LABELS: Record<string, string> = {
  format: 'Biçim', relevant_files: 'İlgili dosya', parsed_javascript_files: 'JS dosyası', modules: 'Modül', findings: 'Bulgu', ipc_operations: 'IPC işlemi', ipc_literal_channels: 'IPC kanalı',
  browser_windows: 'Pencere', native_addon_bindings: 'Native eklenti', parse_failures: 'Ayrıştırma hatası', analiz_suresi_sn: 'Analiz süresi (sn)',
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access();
  if (!a.ok) return null;
  const p = await a.store.getProject(a.actor.orgId, id);
  if (!p) notFound();
  const run = await a.store.latestRun(a.actor.orgId, id);
  const light = run ? (({ digest, ...r }) => { void digest; return r; })(run) : null;
  const stats = Object.entries(run?.summary?.stats ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  const limitations = (run?.digest?.limitations ?? []);
  const showCmds = p.target_kind === 'local';

  return (
    <div className="stack-y">
      <section className="card grid-2" aria-label="Proje bilgisi">
        <dl className="grid gap-3 text-[13.5px]">
          <div><dt className="eyebrow">Hedef</dt><dd className="mt-1 break-all">{p.target_kind === 'web' ? p.target_url : p.upload_name ?? p.target_url ?? '— (dosya bekleniyor)'}{p.upload_bytes ? <span className="muted"> · {fmtBytes(p.upload_bytes)}</span> : null}</dd></div>
          <div><dt className="eyebrow">Oluşturuldu</dt><dd className="mt-1">{fmtDate(p.created_at)}</dd></div>
        </dl>
        <div className="grid gap-2 text-[13.5px]">
          <div><div className="eyebrow">Özellik sorusu</div><p className="mt-1">{p.question || <span className="muted">Girilmemiş</span>}</p></div>
          {p.seeds.length > 0 && <div className="row">{p.seeds.map((s) => <span key={s} className="chip chip-brand mono">{s}</span>)}</div>}
          <div><EditQuestion id={p.id} question={p.question} seeds={p.seeds} /></div>
        </div>
      </section>

      {showCmds && !p.upload_path && (
        <section className="card" aria-labelledby="loc-h">
          <h2 id="loc-h" className="h2">Bilgisayarında çalıştır</h2>
          <p className="sub">Komutları sırayla kendi terminalinde çalıştır (Node.js 22.19+ gerekir), sonra oluşan .json dosyasını aşağıdan yükle.</p>
          <div className="cmd-steps">{buildLocalCommands(p.target_url, p.name).map((s) => <CommandBlock key={s.title} title={s.title} text={s.command} note={s.note} />)}</div>
        </section>
      )}

      <RunPanel projectId={p.id} kind={p.target_kind} initial={light} hasUpload={p.target_kind === 'web' || !!p.upload_path || p.status !== 'draft'} demo={a.actor.mode === 'demo'} />

      {run?.status === 'done' && (
        <>
          <section className="card grid gap-4" aria-labelledby="sum-h">
            <h2 id="sum-h" className="h2">REA özeti</h2>
            {stats.length ? <div className="stat-grid">{stats.map(([k, v]) => <div className="stat" key={k}><b>{typeof v === 'number' ? v.toLocaleString('tr-TR') : String(v)}</b><span>{STAT_LABELS[k] ?? k}</span></div>)}</div> : <p className="sub">Sayısal özet çıkarılamadı.</p>}
            <p className="sub">
              Ham REA çıktısı {fmtBytes(run.evidence_bytes)}{run.evidence_truncated ? ` — ${fmtBytes(5 * 1048576)} üstü olduğu için veritabanına yazılmadı; özet ve ${run.digest?.items.length ?? 0} kanıt kaydı saklandı.` : ' — veritabanında saklandı.'}
            </p>
            <div className="row"><Link className="btn btn-primary" href={`/projeler/${p.id}/bulgular`}>Bulgulara git</Link></div>
          </section>
          {limitations.length > 0 && (
            <details className="fold">
              <summary>REA&apos;nın kendi bildirdiği sınırlar ({limitations.length})</summary>
              <ul className="list">{limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
