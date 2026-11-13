'use client';
import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MILESTONE_STATUS, milestoneProgress, type Milestone, type Task } from '@jscore/contracts';
import { useSession } from '../session';
import { useToast } from '../toasts';
import { fmtDate } from '../ui';

const STATUS_TR: Record<(typeof MILESTONE_STATUS)[number], string> = { planned: 'Planlı', active: 'Aktif', done: 'Tamamlandı', missed: 'Kaçırıldı' };

/** Proje kilometre taşları: ilerleme çubukları (bağlı görevlerden), ekle / durum / bitiş / sil. Veri: Repo `milestones`. */
export function MilestonePanel({ projectId, milestones, tasks, today, canEdit, onChange }: { projectId: string; milestones: Milestone[]; tasks: Task[]; today: string; canEdit: boolean; onChange: (ms: Milestone[]) => void }) {
  const { repo } = useSession();
  const toast = useToast();
  const id = useId();
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows = milestoneProgress(milestones, tasks, today);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || name.trim().length < 1 || busy) return;
    setBusy(true); setErr(null);
    try { const m = await repo.save('milestones', { project_id: projectId, name: name.trim(), due_at: due || null, status: 'planned' }); onChange([...milestones, m]); setName(''); setDue(''); toast.success('Kilometre taşı eklendi', m.name); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Eklenemedi'); } finally { setBusy(false); }
  };
  const update = async (m: Milestone, patch: Partial<Pick<Milestone, 'status' | 'due_at' | 'name'>>) => {
    if (!repo) return;
    try { const n = await repo.save('milestones', { id: m.id, ...patch }); onChange(milestones.map((x) => (x.id === m.id ? n : x))); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Güncellenemedi'); }
  };
  const remove = async (m: Milestone) => {
    if (!repo || !window.confirm(`"${m.name}" silinsin mi? Bağlı görevlerin kilometre taşı boşalır.`)) return;
    try { await repo.remove('milestones', m.id); onChange(milestones.filter((x) => x.id !== m.id)); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Silinemedi'); }
  };
  return (
    <section className="wk-box" aria-label="Kilometre taşları">
      <h3>Kilometre taşları {rows.length > 0 && <span className="wk-chip">{rows.filter((r) => r.milestone.status === 'done').length}/{rows.length}</span>}</h3>
      {err && <p role="alert" className="wk-error">{err}</p>}
      {rows.length === 0 ? <p className="wk-muted">Henüz kilometre taşı yok. Kurul planı aktarımı da buraya yazar.</p> : (
        <div className="wk-ms">
          {rows.map(({ milestone: m, total, done, pct, overdue }) => (
            <div key={m.id} className="wk-ms-row" data-overdue={overdue || undefined}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{m.name}</strong>
                  <span className="wk-chip" data-tone={m.status === 'done' ? 'ok' : undefined}>{STATUS_TR[m.status]}</span>
                  <span className={`wk-date ${overdue ? 'late' : ''}`}>{fmtDate(m.due_at)}</span>
                  <span className="wk-muted" style={{ fontSize: 12 }}>{total ? `${done}/${total} görev` : 'bağlı görev yok'}</span>
                </div>
                <span className="wk-progress-bar" role="progressbar" aria-label={`${m.name} ilerlemesi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ display: 'block', marginTop: 8 }}><span style={{ width: `${pct}%` }} /></span>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <label className="wk-sr" htmlFor={`${id}-s-${m.id}`}>Durum</label>
                  <select id={`${id}-s-${m.id}`} className="wk-field" style={{ width: 'auto', minHeight: 32 }} value={m.status} onChange={(e) => void update(m, { status: e.target.value as Milestone['status'] })}>{MILESTONE_STATUS.map((s) => <option key={s} value={s}>{STATUS_TR[s]}</option>)}</select>
                  <label className="wk-sr" htmlFor={`${id}-d-${m.id}`}>Bitiş</label>
                  <input id={`${id}-d-${m.id}`} type="date" className="wk-field" style={{ width: 'auto', minHeight: 32 }} value={m.due_at?.slice(0, 10) ?? ''} onChange={(e) => void update(m, { due_at: e.target.value || null })} />
                  <button type="button" className="wk-ib" aria-label={`${m.name} sil`} onClick={() => void remove(m)}><Trash2 size={15} aria-hidden /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <form onSubmit={add} className="wk-toolbar" style={{ paddingBottom: 0 }} aria-busy={busy}>
          <label className="wk-sr" htmlFor={`${id}-n`}>Kilometre taşı adı</label>
          <input id={`${id}-n`} className="wk-field" style={{ flex: 1, minWidth: 180 }} placeholder="Yeni kilometre taşı…" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="wk-sr" htmlFor={`${id}-due`}>Bitiş</label>
          <input id={`${id}-due`} type="date" className="wk-field" style={{ width: 'auto' }} value={due} onChange={(e) => setDue(e.target.value)} />
          <button type="submit" className="wk-btn" data-sm disabled={busy || name.trim().length < 1}><Plus size={14} aria-hidden />Ekle</button>
        </form>
      )}
    </section>
  );
}
