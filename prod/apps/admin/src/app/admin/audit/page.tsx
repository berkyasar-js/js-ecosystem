'use client';
import { useMemo, useState } from 'react';
import { Async, PageHeader, Tabs, fmtTime } from '@/components/ui';
import { NeedsSupabase } from '@/components/admin-ui';
import { useApi } from '@/lib/client';

interface AuditRow { id: string; actor: string | null; action: string; resource: string; outcome: string; occurred_at: string; meta: Record<string, unknown> }
interface SyncRow { id: string; provider: string; direction: string; entity: string; entity_id: string | null; external_id: string | null; action: string; ok: boolean; message: string; created_at: string }
type Res = { source: 'audit'; rows: AuditRow[]; actors: Record<string, string> } | { source: 'sync'; rows: SyncRow[] };

export default function Audit() {
  return (<><PageHeader title="Denetim kaydı" sub="Yönetim işlemleri, uygulama denetimi ve entegrasyon senkron günlüğü" /><NeedsSupabase><Inner /></NeedsSupabase></>);
}
function Inner() {
  const [source, setSource] = useState<'audit' | 'sync'>(() => (typeof window !== 'undefined' && new URLSearchParams(location.search).get('source') === 'sync' ? 'sync' : 'audit'));
  const [f, setF] = useState({ action: '', outcome: '', q: '', from: '', to: '', admin: false });
  const [applied, setApplied] = useState(f);
  const url = useMemo(() => {
    const p = new URLSearchParams({ source, limit: '200' });
    if (applied.action) p.set('action', applied.action);
    if (applied.outcome) p.set('outcome', applied.outcome);
    if (applied.q) p.set('q', applied.q);
    if (applied.from) p.set('from', new Date(applied.from).toISOString());
    if (applied.to) p.set('to', new Date(applied.to + 'T23:59:59').toISOString());
    if (applied.admin && source === 'audit') p.set('admin', '1');
    return `/api/admin/audit?${p}`;
  }, [source, applied]);
  const q = useApi<Res>(url);
  return (
    <>
      <Tabs<'audit' | 'sync'> tabs={[['audit', 'Denetim olayları'], ['sync', 'Entegrasyon senkron günlüğü']]} value={source} onChange={setSource} />
      <form className="card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <div><label className="label" htmlFor="f-act">Eylem (önek)</label><input id="f-act" className="input" placeholder={source === 'audit' ? 'admin.user' : 'error'} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} /></div>
        <div><label className="label" htmlFor="f-out">Sonuç</label><select id="f-out" className="input" value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="">Hepsi</option>{source === 'audit' ? <><option value="allow">allow</option><option value="deny">deny</option><option value="error">error</option></> : <><option value="ok">Başarılı</option><option value="error">Hatalı</option></>}</select></div>
        <div><label className="label" htmlFor="f-q">{source === 'audit' ? 'Kaynak içerir' : 'Mesaj / kimlik'}</label><input id="f-q" className="input" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        <div><label className="label" htmlFor="f-from">Başlangıç</label><input id="f-from" type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div><label className="label" htmlFor="f-to">Bitiş</label><input id="f-to" type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
        <div className="flex items-end gap-3">
          {source === 'audit' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.admin} onChange={(e) => setF({ ...f, admin: e.target.checked })} /> Yalnızca yönetim</label>}
          <button className="btn btn-primary">Filtrele</button>
        </div>
      </form>
      <Async q={q}>{(d) => d.source === 'audit' ? (
        <section className="card overflow-x-auto"><table className="table"><thead><tr><th>Zaman</th><th>Kim</th><th>Eylem</th><th>Kaynak</th><th>Sonuç</th><th>Ayrıntı</th></tr></thead><tbody>
          {d.rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{fmtTime(r.occurred_at)}</td><td>{r.actor ? d.actors[r.actor] ?? r.actor.slice(0, 8) : '—'}</td><td><code>{r.action}</code></td><td className="max-w-[240px] truncate" title={r.resource}>{r.resource}</td><td><span className={`chip ${r.outcome === 'allow' ? 'chip-ok' : 'chip-bad'}`}>{r.outcome}</span></td>
            <td className="max-w-[320px] truncate text-xs text-muted" title={JSON.stringify(r.meta)}>{Object.keys(r.meta ?? {}).length ? JSON.stringify(r.meta) : ''}</td></tr>)}
          {d.rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted">Kayıt yok.</td></tr>}
        </tbody></table></section>
      ) : (
        <section className="card overflow-x-auto"><table className="table"><thead><tr><th>Zaman</th><th>Sağlayıcı</th><th>Yön</th><th>Varlık</th><th>Eylem</th><th>Sonuç</th><th>Mesaj</th></tr></thead><tbody>
          {d.rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{fmtTime(r.created_at)}</td><td>{r.provider}</td><td>{r.direction}</td><td>{r.entity}{r.external_id && <div className="text-xs text-muted">{r.external_id}</div>}</td><td><code>{r.action}</code></td><td><span className={`chip ${r.ok ? 'chip-ok' : 'chip-bad'}`}>{r.ok ? 'ok' : 'hata'}</span></td><td className="max-w-[360px] truncate" title={r.message}>{r.message}</td></tr>)}
          {d.rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted">Kayıt yok.</td></tr>}
        </tbody></table></section>
      )}</Async>
    </>
  );
}
