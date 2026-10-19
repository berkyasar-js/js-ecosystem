'use client';
import { useEffect, useId, useState } from 'react';
import type { Priority, Project, Task, TeamMember } from '@jscore/contracts';
import { OrbitDialog } from '../dialog';
import { PRIORITY_LABEL } from './work-utils';

/** Yeni görev penceresi. Gönderim sürerken tekrar kayıt engellenir; hata girdiyi korur ve alanın yanında kalır. */
export function NewTaskDialog({ open, onClose, projects, projectId, team, today, onCreate }: {
  open: boolean; onClose: () => void; projects: Project[]; projectId?: string; team: TeamMember[]; today: string;
  onCreate: (input: { project_id: string; title: string; assignee_id: string | null; priority: Priority; due_at: string }) => Promise<Task>;
}) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(projectId ?? projects[0]?.id ?? '');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [due, setDue] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setTitle(''); setAssignee(''); setPriority('normal'); setDue(today); setErr(null); setTitleErr(null); setProject(projectId ?? projects[0]?.id ?? ''); } }, [open, today, projectId, projects]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (title.trim().length < 2) { setTitleErr('Görev adı en az 2 karakter olmalı.'); return; }
    setTitleErr(null); setErr(null); setBusy(true);
    try { await onCreate({ project_id: project, title: title.trim(), assignee_id: assignee || null, priority, due_at: due || today }); onClose(); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Görev oluşturulamadı'); }
    finally { setBusy(false); }
  };
  return (
    <OrbitDialog open={open} onClose={() => { if (!busy) onClose(); }} title="Yeni görev" description="Görev seçili projenin ilk aşaması olan Brief ile başlar.">
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="wk-dialog-body">
          <div>
            <label className="wk-label" htmlFor={`${id}-t`}>Görev adı *</label>
            <input id={`${id}-t`} className="wk-field" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!titleErr} aria-describedby={titleErr ? `${id}-te` : undefined} maxLength={200} />
            {titleErr && <p id={`${id}-te`} role="alert" className="wk-error">{titleErr}</p>}
          </div>
          {!projectId && (
            <div>
              <label className="wk-label" htmlFor={`${id}-p`}>Proje</label>
              <select id={`${id}-p`} className="wk-field" value={project} onChange={(e) => setProject(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </div>
          )}
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div>
              <label className="wk-label" htmlFor={`${id}-a`}>Sorumlu</label>
              <select id={`${id}-a`} className="wk-field" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Atanmamış</option>{team.filter((m) => m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="wk-label" htmlFor={`${id}-d`}>Bitiş tarihi</label>
              <input id={`${id}-d`} type="date" className="wk-field" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <label className="wk-label" htmlFor={`${id}-pr`}>Öncelik</label>
              <select id={`${id}-pr`} className="wk-field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
            </div>
          </div>
          {err && <p role="alert" className="wk-error">{err}</p>}
        </div>
        <div className="wk-dialog-actions">
          <button type="button" className="wk-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
          <button type="submit" className="wk-btn" data-primary disabled={busy}>{busy ? 'Ekleniyor…' : 'Görev ekle'}</button>
        </div>
      </form>
    </OrbitDialog>
  );
}
