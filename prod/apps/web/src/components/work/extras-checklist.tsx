'use client';
import { useId, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { TaskChecklist, TaskCheckItem, TeamMember } from '@jscore/contracts';
import type { Repo } from '@/lib/repo/types';
import { fmtDate } from '../ui';
import type { TaskExtras } from './use-task-extras';

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** Satır içi düzenlenebilir ad: Enter kaydeder, Escape vazgeçer, boşta kayıt yok. */
function InlineName({ value, label, disabled, onSave, className }: { value: string; label: string; disabled: boolean; onSave: (v: string) => Promise<boolean>; className?: string }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  const btn = useRef<HTMLButtonElement>(null);
  const done = (focusBack: boolean) => { setEdit(false); if (focusBack) requestAnimationFrame(() => btn.current?.focus()); };
  const commit = async () => {
    const t = v.trim();
    if (!t || t === value) { setV(value); done(true); return; }
    const ok = await onSave(t);
    if (!ok) setV(value);
    done(true);
  };
  if (edit) {
    return <input className="wk-field wk-x-inline" aria-label={label} value={v} autoFocus maxLength={500} onChange={(e) => setV(e.target.value)} onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commit(); } if (e.key === 'Escape') { e.stopPropagation(); setV(value); done(true); } }} />;
  }
  return <button ref={btn} type="button" className={`wk-x-namebtn ${className ?? ''}`} disabled={disabled} title={disabled ? undefined : 'Yeniden adlandırmak için tıkla'} onClick={() => { setV(value); setEdit(true); }}>{value}</button>;
}

function ConfirmDelete({ label, onConfirm, disabled }: { label: string; onConfirm: () => void; disabled: boolean }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className="wk-ib wk-x-ib" aria-label={label} disabled={disabled} onClick={() => setAsk(true)}><Trash2 size={14} aria-hidden /></button>;
  return (
    <span className="wk-x-confirm" role="group" aria-label={`${label}: onay`}>
      <button type="button" className="wk-btn" data-sm autoFocus onClick={() => { setAsk(false); onConfirm(); }}>Sil</button>
      <button type="button" className="wk-btn" data-sm onClick={() => setAsk(false)}>Vazgeç</button>
    </span>
  );
}

function Item({ it, x, repo, team, canEdit }: { it: TaskCheckItem; x: TaskExtras; repo: Repo; team: TeamMember[]; canEdit: boolean }) {
  const id = useId();
  const [more, setMore] = useState(false);
  const busy = x.busy.has(`item:${it.id}`);
  const setItem = (n: TaskCheckItem) => x.setLists((ls) => ls && ls.map((l) => (l.id === n.checklist_id ? { ...l, items: l.items.map((i) => (i.id === n.id ? n : i)) } : l)));
  const patch = async (p: Parameters<Repo['updateCheckItem']>[1], ok?: [string, string?]) => {
    const r = await x.exec('checklist', `item:${it.id}`, () => repo.updateCheckItem(it.id, p), ok);
    if (r.ok) setItem(r.value);
    return r.ok;
  };
  const who = team.find((m) => m.id === it.assignee_id);
  return (
    <li className="wk-x-item" data-done={it.checked} aria-busy={busy}>
      <input id={`${id}-c`} type="checkbox" checked={it.checked} disabled={!canEdit || busy} onChange={(e) => void patch({ checked: e.target.checked }, [e.target.checked ? 'Madde tamamlandı' : 'Madde yeniden açıldı', it.name])} />
      <label htmlFor={`${id}-c`} className="wk-sr">{it.name} tamamlandı</label>
      <InlineName value={it.name} label={`Madde adı: ${it.name}`} disabled={!canEdit || busy} onSave={(name) => patch({ name }, ['Madde güncellendi', name])} className={it.checked ? 'done' : ''} />
      {it.due_at && <span className="wk-chip">{fmtDate(it.due_at)}</span>}
      {who && <span className="wk-chip">{who.name.split(' ')[0]}</span>}
      {canEdit && <>
        <button type="button" className="wk-btn" data-sm aria-expanded={more} aria-controls={`${id}-more`} onClick={() => setMore((m) => !m)}>{more ? 'Kapat' : 'Ayrıntı'}</button>
        <ConfirmDelete label={`${it.name} maddesini sil`} disabled={busy} onConfirm={() => void x.exec('checklist', `item:${it.id}`, () => repo.deleteCheckItem(it.id), ['Madde silindi', it.name]).then((r) => { if (r.ok) x.setLists((ls) => ls && ls.map((l) => (l.id === it.checklist_id ? { ...l, items: l.items.filter((i) => i.id !== it.id) } : l))); })} />
      </>}
      {more && canEdit && (
        <div id={`${id}-more`} className="wk-x-itemmore">
          <label>Bitiş<input type="date" className="wk-field" value={it.due_at?.slice(0, 10) ?? ''} disabled={busy} onChange={(e) => void patch({ due_at: e.target.value || null }, ['Madde güncellendi', it.name])} /></label>
          <label>Sorumlu
            <select className="wk-field" value={it.assignee_id ?? ''} disabled={busy} onChange={(e) => void patch({ assignee_id: e.target.value || null }, ['Madde güncellendi', it.name])}>
              <option value="">Atanmamış</option>
              {team.filter((m) => m.status === 'active' || m.id === it.assignee_id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
      )}
    </li>
  );
}

function List({ cl, x, repo, team, canEdit }: { cl: TaskChecklist; x: TaskExtras; repo: Repo; team: TeamMember[]; canEdit: boolean }) {
  const id = useId();
  const [name, setName] = useState('');
  const done = cl.items.filter((i) => i.checked).length;
  const p = pct(done, cl.items.length);
  const busy = x.busy.has(`list:${cl.id}`);
  const addItem = async () => {
    const n = name.trim();
    if (!n) return;
    const r = await x.exec('checklist', `add:${cl.id}`, () => repo.addCheckItem(cl.id, { name: n }), ['Madde eklendi', n]);
    if (r.ok) { setName(''); x.setLists((ls) => ls && ls.map((l) => (l.id === cl.id ? { ...l, items: [...l.items, r.value] } : l))); }
  };
  return (
    <section className="wk-x-list" aria-labelledby={`${id}-h`}>
      <header>
        <h4 id={`${id}-h`}><InlineName value={cl.name} label={`Checklist adı: ${cl.name}`} disabled={!canEdit || busy} onSave={async (n) => {
          const r = await x.exec('checklist', `list:${cl.id}`, () => repo.updateChecklist(cl.id, { name: n }), ['Checklist yeniden adlandırıldı', n]);
          if (r.ok) x.setLists((ls) => ls && ls.map((l) => (l.id === cl.id ? { ...l, name: r.value.name } : l)));
          return r.ok;
        }} /></h4>
        <span className="wk-muted" aria-hidden>{done}/{cl.items.length}</span>
        {canEdit && <ConfirmDelete label={`${cl.name} checklist'ini sil`} disabled={busy} onConfirm={() => void x.exec('checklist', `list:${cl.id}`, () => repo.deleteChecklist(cl.id), ['Checklist silindi', cl.name]).then((r) => { if (r.ok) x.setLists((ls) => ls && ls.filter((l) => l.id !== cl.id)); })} />}
      </header>
      <div className="wk-x-progress" role="progressbar" aria-label={`${cl.name} ilerlemesi`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-valuetext={`${done} / ${cl.items.length} madde`}><i style={{ width: `${p}%` }} /></div>
      {cl.items.length > 0 && <ul className="wk-x-items">{cl.items.map((it) => <Item key={it.id} it={it} x={x} repo={repo} team={team} canEdit={canEdit} />)}</ul>}
      {canEdit && (
        <form className="wk-x-addrow" onSubmit={(e) => { e.preventDefault(); void addItem(); }}>
          <label className="wk-sr" htmlFor={`${id}-new`}>{cl.name} için yeni madde</label>
          <input id={`${id}-new`} className="wk-field" placeholder="Madde ekle…" maxLength={1000} value={name} onChange={(e) => setName(e.target.value)} disabled={x.busy.has(`add:${cl.id}`)} />
          <button type="submit" className="wk-btn" data-sm disabled={!name.trim() || x.busy.has(`add:${cl.id}`)}><Plus size={14} aria-hidden />Ekle</button>
        </form>
      )}
    </section>
  );
}

export function ChecklistSection({ x, repo, taskId, team, canEdit }: { x: TaskExtras; repo: Repo; taskId: string; team: TeamMember[]; canEdit: boolean }) {
  const id = useId();
  const [name, setName] = useState('Checklist');
  const lists = x.lists ?? [];
  const total = lists.flatMap((l) => l.items).length, done = lists.flatMap((l) => l.items).filter((i) => i.checked).length;
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    const r = await x.exec('checklist', 'add-list', () => repo.addChecklist(taskId, n), ['Checklist eklendi', n]);
    if (r.ok) { setName('Checklist'); x.setLists((ls) => [...(ls ?? []), r.value]); }
  };
  return (
    <div className="wk-x-pane">
      {total > 0 && <p className="wk-muted" role="status">Toplam ilerleme: {done}/{total} · %{pct(done, total)}</p>}
      {x.errors.checklist && <p role="alert" className="wk-detail-note" data-tone="error">{x.errors.checklist} <button type="button" className="wk-x-link" onClick={() => x.clear('checklist')}><X size={12} aria-hidden /><span className="wk-sr">Hatayı kapat</span></button></p>}
      {lists.length === 0 && <p className="wk-muted">Bu görevde henüz checklist yok.</p>}
      {lists.map((cl) => <List key={cl.id} cl={cl} x={x} repo={repo} team={team} canEdit={canEdit} />)}
      {canEdit && (
        <form className="wk-x-addrow" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label className="wk-sr" htmlFor={`${id}-nl`}>Yeni checklist adı</label>
          <input id={`${id}-nl`} className="wk-field" value={name} maxLength={500} onChange={(e) => setName(e.target.value)} disabled={x.busy.has('add-list')} />
          <button type="submit" className="wk-btn" data-sm disabled={!name.trim() || x.busy.has('add-list')}><Plus size={14} aria-hidden />Checklist ekle</button>
        </form>
      )}
    </div>
  );
}
