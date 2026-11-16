'use client';
import { useMemo, useState } from 'react';
import { Link2, Lock, Plus, X } from 'lucide-react';
import { TASK_LINK_KINDS, TASK_LINK_LABELS, TASK_STATE_LABELS, isDepDone, wouldCycle, type Task, type TaskLink, type TaskLinkKind } from '@jscore/contracts';

type Direction = 'out' | 'in';
/** Seçim: ilişki türü + yön → (from, to). "Bunu engelliyor" = seçilen görev bu görevi engeller (from=seçilen, to=bu). */
const OPTIONS: Array<{ id: string; kind: TaskLinkKind; dir: Direction; label: string }> = [
  { id: 'blocked_by', kind: 'blocks', dir: 'in', label: 'Bunu engelliyor (önce o bitmeli)' },
  { id: 'blocks', kind: 'blocks', dir: 'out', label: 'Buna bağlı (bu bitmeden o başlayamaz)' },
  { id: 'relates', kind: 'relates', dir: 'out', label: 'İlgili' },
  { id: 'duplicates', kind: 'duplicates', dir: 'out', label: 'Kopyası' },
];

/** Görev ayrıntısı → "Bağımlılıklar": engelleyenler / engellenenler / ilgili; arama ile bağ ekleme, kaldırma. */
export function DependencySection({ task, tasks, links, canEdit, busy = false, onAdd, onRemove, onOpen }: {
  task: Task; tasks: Task[]; links: TaskLink[]; canEdit: boolean; busy?: boolean;
  onAdd: (input: { from_task_id: string; to_task_id: string; kind: TaskLinkKind }) => void; onRemove: (linkId: string) => void; onOpen?: (taskId: string) => void;
}) {
  const [opt, setOpt] = useState(OPTIONS[0].id);
  const [q, setQ] = useState('');
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const mine = links.filter((l) => l.from_task_id === task.id || l.to_task_id === task.id);
  const groups: Array<[string, TaskLink[], (l: TaskLink) => string]> = [
    ['Engelleyenler', mine.filter((l) => l.kind === 'blocks' && l.to_task_id === task.id), (l) => l.from_task_id],
    ['Engellediği görevler', mine.filter((l) => l.kind === 'blocks' && l.from_task_id === task.id), (l) => l.to_task_id],
    ['İlgili / kopya', mine.filter((l) => l.kind !== 'blocks'), (l) => (l.from_task_id === task.id ? l.to_task_id : l.from_task_id)],
  ];
  const open = groups[0][1].filter((l) => { const t = byId.get(l.from_task_id); return t && !isDepDone(t); }).length;
  const text = q.trim().toLocaleLowerCase('tr');
  const sel = OPTIONS.find((o) => o.id === opt)!;
  const linked = new Set(mine.map((l) => (l.from_task_id === task.id ? l.to_task_id : l.from_task_id)));
  const hits = text.length < 2 ? [] : tasks.filter((t) => t.id !== task.id && !linked.has(t.id) && (t.title.toLocaleLowerCase('tr').includes(text) || t.id.toLocaleLowerCase('tr') === text)).slice(0, 8);
  const add = (other: Task) => {
    const from = sel.dir === 'in' ? other.id : task.id, to = sel.dir === 'in' ? task.id : other.id;
    if (sel.kind === 'blocks' && wouldCycle(from, to, links)) return;
    onAdd({ from_task_id: from, to_task_id: to, kind: sel.kind });
    setQ('');
  };
  return (
    <section className="wk-detail-section" aria-label="Bağımlılıklar" aria-busy={busy}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Link2 size={14} aria-hidden />Bağımlılıklar{open > 0 && <span className="wk-chip" data-tone="warn"><Lock size={11} aria-hidden />{open} engel</span>}</h3>
      {open > 0 && <p className="wk-detail-note wk-muted">Bu görev engelli: engelleyen görevler teslim edilmeden üretime geçemez (owner / org admin / PM geçebilir).</p>}
      {mine.length === 0 && <p className="wk-muted" style={{ fontSize: 13 }}>Bağ yok.</p>}
      {groups.map(([label, rows, other]) => rows.length > 0 && (
        <div key={label} style={{ marginBottom: 8 }}>
          <span className="wk-label">{label}</span>
          <ul className="wk-list">
            {rows.map((l) => { const t = byId.get(other(l)); const done = !!t && isDepDone(t); return (
              <li key={l.id}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {l.kind === 'blocks' && <Lock size={12} aria-hidden style={{ opacity: done ? 0.4 : 1 }} />}
                  {t && onOpen ? <button type="button" className="wk-task-title" style={{ fontSize: 13 }} onClick={() => onOpen(t.id)}>{t.title}</button> : <span>{t?.title ?? other(l)}</span>}
                  <span className="wk-chip" data-tone={done ? 'ok' : undefined}>{t ? TASK_STATE_LABELS[t.state] : '—'}</span>
                  {l.kind !== 'blocks' && <span className="wk-chip">{TASK_LINK_LABELS[l.kind].forward}</span>}
                </span>
                {canEdit && <button type="button" className="wk-ib" aria-label="Bağı kaldır" disabled={busy} onClick={() => onRemove(l.id)}><X size={14} aria-hidden /></button>}
              </li>
            ); })}
          </ul>
        </div>
      ))}
      {canEdit && (
        <div className="wk-dep-add">
          <label className="wk-sr" htmlFor="dep-kind">İlişki</label>
          <select id="dep-kind" className="wk-field" value={opt} onChange={(e) => setOpt(e.target.value)} disabled={busy}>{OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          <label className="wk-sr" htmlFor="dep-q">Görev ara</label>
          <input id="dep-q" className="wk-field" placeholder="Görev ara ve bağla…" value={q} disabled={busy} onChange={(e) => setQ(e.target.value)} />
          {hits.length > 0 && (
            <ul className="wk-dep-hits" role="listbox" aria-label="Eşleşen görevler">
              {hits.map((t) => { const cyc = sel.kind === 'blocks' && wouldCycle(sel.dir === 'in' ? t.id : task.id, sel.dir === 'in' ? task.id : t.id, links); return (
                <li key={t.id}><button type="button" role="option" aria-selected={false} disabled={cyc} title={cyc ? 'Döngü oluşturur' : undefined} onClick={() => add(t)}><Plus size={13} aria-hidden /><span>{t.title}</span><span className="wk-chip">{TASK_STATE_LABELS[t.state]}</span>{cyc && <span className="wk-chip" data-tone="bad">döngü</span>}</button></li>
              ); })}
            </ul>
          )}
          {text.length >= 2 && hits.length === 0 && <p className="wk-muted" style={{ fontSize: 12 }}>Eşleşen görev yok.</p>}
        </div>
      )}
      <p className="wk-muted" style={{ fontSize: 11, marginTop: 6 }}>Türler: {TASK_LINK_KINDS.map((k) => TASK_LINK_LABELS[k].forward).join(' · ')}</p>
    </section>
  );
}
