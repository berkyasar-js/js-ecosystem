'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { Bookmark, ChevronDown, Pin, PinOff, Save, Trash2 } from 'lucide-react';
import { TASK_STATES, TASK_STATE_LABELS, sameViewQuery, serializeViewQuery, type SavedView, type SavedViewQuery, type TeamMember } from '@jscore/contracts';
import { OrbitDialog } from '../dialog';
import { useSession } from '../session';
import { useToast } from '../toasts';
import { EMPTY_FILTERS, type WorkFilters } from './work-utils';

const SORTS: Array<[NonNullable<SavedViewQuery['sort']>, string]> = [['due', 'Bitiş'], ['priority', 'Öncelik'], ['title', 'Ad'], ['created', 'Yeni eklenen']];
const GROUPS: Array<[NonNullable<SavedViewQuery['group']>, string]> = [['none', 'Gruplama yok'], ['state', 'Aşamaya göre'], ['assignee', 'Sorumluya göre'], ['project', 'Projeye göre']];
const MANAGER_ROLES = ['owner', 'org_admin', 'operations', 'account', 'pm'];

/** Filtre sorgusu (WorkFilters) ↔ SavedViewQuery: boş alanlar düşer. */
export const toQuery = (f: WorkFilters): SavedViewQuery => {
  const q: SavedViewQuery = {};
  if (f.mine) q.mine = true; if (f.high) q.high = true; if (f.q.trim()) q.q = f.q.trim();
  if (f.states?.length) q.states = f.states; if (f.assignee) q.assignee = f.assignee; if (f.project) q.project = f.project;
  if (f.sort && f.sort !== 'due') q.sort = f.sort; if (f.group && f.group !== 'none') q.group = f.group;
  return q;
};
export const fromQuery = (q: SavedViewQuery): WorkFilters => ({ ...EMPTY_FILTERS, ...q, mine: !!q.mine, high: !!q.high, q: q.q ?? '' });

/**
 * Görünüm çubuğu: kayıtlı görünümler (kişisel + org), gelişmiş filtreler (aşama, sorumlu, sıralama, gruplama),
 * "Görünümü kaydet" ve kenar çubuğuna sabitleme (user_prefs.pinned_views). Veri: Repo `saved_views` koleksiyonu.
 */
export function ViewBar({ filters, setFilters, team, showProjectFilter, projects, activeViewId, onPickView }: {
  filters: WorkFilters; setFilters: (f: WorkFilters) => void; team: TeamMember[]; showProjectFilter?: boolean; projects?: Array<{ id: string; name: string }>;
  activeViewId?: string | null; onPickView?: (v: SavedView | null) => void;
}) {
  const { repo, me, prefs, setPrefs, rev } = useSession();
  const toast = useToast();
  const id = useId();
  const [views, setViews] = useState<SavedView[]>([]);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'personal' | 'org'>('personal');
  const [pin, setPin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!repo || !me) return;
    let alive = true;
    repo.list('saved_views').then((v) => alive && setViews(v.filter((x) => x.entity === 'tasks' && (x.scope === 'org' || x.owner_user_id === me.id))), () => alive && setViews([]));
    return () => { alive = false; };
  }, [repo, me, rev]);
  const current = useMemo(() => views.find((v) => v.id === activeViewId) ?? views.find((v) => sameViewQuery(v.query, toQuery(filters))) ?? null, [views, activeViewId, filters]);
  const dirty = !!current && !sameViewQuery(current.query, toQuery(filters));
  const canOrg = !!me && MANAGER_ROLES.includes(me.role);
  const pinned = new Set(prefs.pinned_views);

  const pick = (v: SavedView | null) => { setFilters(v ? fromQuery(v.query) : EMPTY_FILTERS); onPickView?.(v); };
  const save = async () => {
    if (!repo || !me) return;
    if (name.trim().length < 1) { setErr('Görünüm adı gerekli.'); return; }
    setBusy(true); setErr(null);
    try {
      const v = await repo.save('saved_views', { owner_user_id: me.id, scope: canOrg ? scope : 'personal', entity: 'tasks', name: name.trim(), query: toQuery(filters) });
      setViews((xs) => [...xs, v]);
      if (pin) await setPrefs({ pinned_views: [...prefs.pinned_views.filter((x) => x !== v.id), v.id].slice(-12) });
      toast.success('Görünüm kaydedildi', v.name);
      setOpen(false); setName(''); onPickView?.(v);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Kaydedilemedi'); } finally { setBusy(false); }
  };
  const update = async () => {
    if (!repo || !current) return;
    setBusy(true);
    try { const v = await repo.save('saved_views', { id: current.id, query: toQuery(filters) }); setViews((xs) => xs.map((x) => (x.id === v.id ? v : x))); toast.success('Görünüm güncellendi', v.name); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Güncellenemedi'); } finally { setBusy(false); }
  };
  const remove = async (v: SavedView) => {
    if (!repo || !window.confirm(`"${v.name}" görünümü silinsin mi?`)) return;
    try { await repo.remove('saved_views', v.id); setViews((xs) => xs.filter((x) => x.id !== v.id)); if (pinned.has(v.id)) await setPrefs({ pinned_views: prefs.pinned_views.filter((x) => x !== v.id) }); if (current?.id === v.id) pick(null); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Silinemedi'); }
  };
  const togglePin = (v: SavedView) => void setPrefs({ pinned_views: pinned.has(v.id) ? prefs.pinned_views.filter((x) => x !== v.id) : [...prefs.pinned_views, v.id].slice(-12) });
  const setF = (p: Partial<WorkFilters>) => setFilters({ ...filters, ...p });
  const toggleState = (s: string) => { const cur = new Set(filters.states ?? []); if (cur.has(s)) cur.delete(s); else cur.add(s); setF({ states: cur.size ? [...cur] : undefined }); };
  const activeExtra = (filters.states?.length ?? 0) + (filters.assignee ? 1 : 0) + (filters.project ? 1 : 0) + (filters.sort && filters.sort !== 'due' ? 1 : 0) + (filters.group && filters.group !== 'none' ? 1 : 0);

  return (
    <div className="wk-viewbar" role="group" aria-label="Görünümler">
      <label className="wk-sr" htmlFor={`${id}-v`}>Kayıtlı görünüm</label>
      <span className="wk-viewsel"><Bookmark size={14} aria-hidden />
        <select id={`${id}-v`} className="wk-field" value={current?.id ?? ''} onChange={(e) => pick(views.find((v) => v.id === e.target.value) ?? null)}>
          <option value="">Tüm görevler</option>
          {views.some((v) => v.scope === 'personal') && <optgroup label="Kişisel">{views.filter((v) => v.scope === 'personal').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
          {views.some((v) => v.scope === 'org') && <optgroup label="Organizasyon">{views.filter((v) => v.scope === 'org').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
        </select>
      </span>
      {current && <>
        <button type="button" className="wk-filter" aria-pressed={pinned.has(current.id)} onClick={() => togglePin(current)} title={pinned.has(current.id) ? 'Kenar çubuğundan kaldır' : 'Kenar çubuğuna sabitle'}>{pinned.has(current.id) ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}{pinned.has(current.id) ? 'Sabit' : 'Sabitle'}</button>
        {dirty && (current.owner_user_id === me?.id || canOrg) && <button type="button" className="wk-filter" disabled={busy} onClick={() => void update()}><Save size={14} aria-hidden />Görünümü güncelle</button>}
        {(current.owner_user_id === me?.id || me?.role === 'owner' || me?.role === 'org_admin') && <button type="button" className="wk-ib" aria-label="Görünümü sil" onClick={() => void remove(current)}><Trash2 size={15} aria-hidden /></button>}
      </>}
      <button type="button" className="wk-filter" aria-expanded={more} onClick={() => setMore((v) => !v)}><ChevronDown size={14} aria-hidden style={{ transform: more ? 'rotate(180deg)' : undefined }} />Filtreler{activeExtra > 0 && <span className="wk-x-count">{activeExtra}</span>}</button>
      <button type="button" className="wk-filter" onClick={() => { setName(current && dirty ? `${current.name} (kopya)` : ''); setOpen(true); }}><Save size={14} aria-hidden />Görünümü kaydet</button>
      {more && (
        <div className="wk-viewmore">
          <fieldset><legend>Aşama</legend><div className="wk-chips">{TASK_STATES.map((s) => <button key={s} type="button" className="wk-chip" data-on={filters.states?.includes(s) || undefined} aria-pressed={filters.states?.includes(s) ?? false} onClick={() => toggleState(s)}>{TASK_STATE_LABELS[s]}</button>)}</div></fieldset>
          <div>
            <label className="wk-label" htmlFor={`${id}-a`}>Sorumlu</label>
            <select id={`${id}-a`} className="wk-field" value={filters.assignee ?? ''} onChange={(e) => setF({ assignee: e.target.value || undefined })}><option value="">Hepsi</option><option value="none">Atanmamış</option>{team.filter((m) => m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
          {showProjectFilter && projects && <div><label className="wk-label" htmlFor={`${id}-p`}>Proje</label><select id={`${id}-p`} className="wk-field" value={filters.project ?? ''} onChange={(e) => setF({ project: e.target.value || undefined })}><option value="">Hepsi</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
          <div><label className="wk-label" htmlFor={`${id}-s`}>Sıralama</label><select id={`${id}-s`} className="wk-field" value={filters.sort ?? 'due'} onChange={(e) => setF({ sort: e.target.value as SavedViewQuery['sort'] })}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label className="wk-label" htmlFor={`${id}-g`}>Gruplama</label><select id={`${id}-g`} className="wk-field" value={filters.group ?? 'none'} onChange={(e) => setF({ group: e.target.value as SavedViewQuery['group'] })}>{GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
      )}
      {err && !open && <p role="alert" className="wk-error" style={{ width: '100%' }}>{err}</p>}
      <OrbitDialog open={open} onClose={() => !busy && setOpen(false)} title="Görünümü kaydet" description={`Filtre: ${serializeViewQuery(toQuery(filters)) || 'tüm görevler'}`}>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <div className="wk-dialog-body">
            <div><label className="wk-label" htmlFor={`${id}-n`}>Ad *</label><input id={`${id}-n`} className="wk-field" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
            {canOrg && <div><label className="wk-label" htmlFor={`${id}-sc`}>Kapsam</label><select id={`${id}-sc`} className="wk-field" value={scope} onChange={(e) => setScope(e.target.value as 'personal' | 'org')}><option value="personal">Kişisel (yalnızca ben)</option><option value="org">Organizasyon (herkes görür)</option></select></div>}
            <label className="wk-check"><input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Kenar çubuğuna (Projeler altına) sabitle</label>
            {err && <p role="alert" className="wk-error">{err}</p>}
          </div>
          <div className="wk-dialog-actions"><button type="button" className="wk-btn" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button><button type="submit" className="wk-btn" data-primary disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
        </form>
      </OrbitDialog>
    </div>
  );
}
