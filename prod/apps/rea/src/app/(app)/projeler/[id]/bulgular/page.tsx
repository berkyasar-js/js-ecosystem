import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlowSteps, ItemList } from '@/components/flow-view';
import { SynthButton } from '@/components/synth-button';
import { Empty, fmtDate } from '@/components/ui';
import { access } from '@/lib/data';

export const metadata: Metadata = { title: 'Bulgular' };
export const dynamic = 'force-dynamic';

export default async function FindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access();
  if (!a.ok) return null;
  const p = await a.store.getProject(a.actor.orgId, id);
  if (!p) notFound();
  const run = await a.store.latestRun(a.actor.orgId, id);
  if (!run || run.status !== 'done' || !run.digest) {
    return <Empty>Bulgular için önce analiz tamamlanmalı. <Link className="text-button" href={`/projeler/${id}`}>Genel duruma git</Link></Empty>;
  }
  const findings = await a.store.listFindings(a.actor.orgId, id);
  const f = findings[0] ?? null;
  const flow = f?.body ?? null;
  const d = run.digest;
  const helperFound = (flow?.has_helper ?? false) || d.helpers.length > 0 || d.items.some((i) => i.kind === 'child-process');

  return (
    <div className="stack-y">
      <section aria-labelledby="flow-h">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div><h2 id="flow-h" className="h2">Özellik akışı</h2><p className="sub">{f ? `${f.title} · ${f.model === 'rehber' ? 'rehberden örnek' : f.model ?? ''}` : 'Henüz sentez yapılmadı.'}</p></div>
        </div>
        {flow ? (
          <div className="stack-y">
            <div className="callout info">{flow.summary}</div>
            <FlowSteps flow={flow} />
            {flow.next_questions.length > 0 && <div className="card"><div className="eyebrow">Sonraki sorular</div><ul className="list mt-2">{flow.next_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
            {findings.length > 1 && <p className="hint">{findings.length - 1} önceki sentez saklı ({fmtDate(findings[1].created_at)}).</p>}
          </div>
        ) : (
          <div className="card grid gap-3">
            <p className="text-[13.5px]">REA kanıtı çıkardı ({d.items.length} kayıt). Yapay zekâ bu kanıtları sorunla birlikte okuyup adım adım akışa, kanıtlara ve belirsizliklere çevirir. Aşağıdaki &quot;Kanıt dizini&quot; ham veridir; sentez onlara dayanır, onların dışına çıkmaz.</p>
            <SynthButton projectId={id} has={false} />
          </div>
        )}
        {flow && <div className="mt-4"><SynthButton projectId={id} has /></div>}
      </section>

      <section aria-labelledby="blind-h">
        <h2 id="blind-h" className="h2">REA&apos;nın göremediği yerler</h2>
        <p className="sub mb-3">Statik analiz çalışma zamanını, dinamik çağrıları ve gizlenmiş kodu göremez. Boş sonuç &quot;yok&quot; demek değildir.</p>
        <div className="stack-y">
          {(flow?.blind_spots ?? []).map((b, i) => <div key={i} className="callout warn"><b>{b.title}.</b> {b.detail}</div>)}
          {!flow && <div className="callout warn">AI sentezi yapıldığında, hangi adımın neden görünmediği burada somut olarak listelenir.</div>}
          {(d.limitations.length > 0 || d.unknowns.length > 0) && (
            <details className="fold">
              <summary>REA&apos;nın kendi bildirdiği sınırlar ve bilinmeyenler ({d.limitations.length + d.unknowns.length})</summary>
              <ul className="list">{[...d.limitations, ...d.unknowns].map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          )}
        </div>
      </section>

      <section aria-labelledby="helper-h">
        <h2 id="helper-h" className="h2">Ayrı çalışan yardımcı program var mı?</h2>
        <div className="row mb-3">
          <span className={`chip ${helperFound ? 'chip-lime' : ''}`}>{helperFound ? 'Kanıt var' : 'Kanıt bulunamadı'}</span>
          {!helperFound && <span className="sub">Bu, olmadığı anlamına gelmez; paketi elle de kontrol et.</span>}
        </div>
        <div className="stack-y">
          {(flow?.helper_programs ?? []).map((h, i) => (
            <div key={i} className="card"><strong>{h.name}</strong>{h.path && <> · <code className="mono">{h.path}</code></>}<p className="sub mt-1">{h.role}</p>{h.evidence && <p className="hint mt-1">Kanıt: {h.evidence}</p>}</div>
          ))}
          {d.helpers.length > 0 && (
            <div className="card"><div className="eyebrow">Pakette bulunan aday dosyalar</div><ul className="list mt-2">{d.helpers.map((h, i) => <li key={i}><code className="mono">{h.path}</code> <span className="muted">— {h.why}</span></li>)}</ul></div>
          )}
          {d.items.filter((i) => i.kind === 'child-process').map((i, k) => <ItemList key={k} items={[i]} limit={1} />)}
          {!helperFound && p.target_kind !== 'web' && <p className="hint">Not: yüklenen paket yalnızca app.asar ise, asar dışında (app.asar.unpacked ya da Contents/MacOS) duran yardımcı programlar görünmez.</p>}
        </div>
      </section>

      <section aria-labelledby="ev-h">
        <h2 id="ev-h" className="h2">Kanıt dizini</h2>
        <p className="sub mb-3">{d.items.length} kayıt{d.keywords.length ? ` · aranan terimler: ${d.keywords.join(', ')}` : ''}. Anahtar kelime eşleşmeleri önce gelir.</p>
        {d.items.length ? <ItemList items={d.items} limit={20} /> : <Empty>REA bu hedefte listelenecek bir IPC kanalı, uç nokta ya da alt süreç bulamadı.</Empty>}
      </section>
    </div>
  );
}
