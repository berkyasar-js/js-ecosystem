'use client';
import { useId, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Me, TaskComment } from '@jscore/contracts';
import type { Repo } from '@/lib/repo/types';
import { Avatar } from '../avatar';
import { fmtTime } from '../ui';
import { MdLite } from './md-lite';
import type { TaskExtras } from './use-task-extras';

const MANAGERS = ['owner', 'org_admin', 'operations'];
const edited = (c: TaskComment) => !!c.updated_at && Date.parse(c.updated_at) - Date.parse(c.created_at) > 2000;

function Comment({ c, x, repo, me, canEdit }: { c: TaskComment; x: TaskExtras; repo: Repo; me: Me | null; canEdit: boolean }) {
  const id = useId();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [ask, setAsk] = useState(false);
  const mine = !!me && c.author_id === me.id;
  const can = canEdit && (mine || (!!me && MANAGERS.includes(me.role)));
  const busy = x.busy.has(`cm:${c.id}`);
  const save = async () => {
    const body = draft.trim();
    if (!body || body === c.body) { setEdit(false); return; }
    const r = await x.exec('comments', `cm:${c.id}`, () => repo.updateComment(c.id, body), ['Yorum güncellendi']);
    if (r.ok) { x.setComments((cs) => cs && cs.map((y) => (y.id === c.id ? r.value : y))); setEdit(false); }
  };
  return (
    <li className="wk-x-comment" aria-busy={busy}>
      <Avatar id={c.author_id ?? undefined} name={c.author_name || '?'} size="sm" />
      <div>
        <div className="wk-x-chead"><strong>{c.author_name || 'Bilinmeyen'}</strong><time dateTime={c.created_at}>{fmtTime(c.created_at)}</time>{edited(c) && <span className="wk-muted">(düzenlendi)</span>}{c.external_id && <span className="wk-chip" data-tone="info">Trello</span>}</div>
        {edit ? (
          <div>
            <label className="wk-sr" htmlFor={`${id}-e`}>Yorumu düzenle</label>
            <textarea id={`${id}-e`} className="wk-field wk-x-ta" rows={3} value={draft} autoFocus maxLength={20000} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(false); setDraft(c.body); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }} />
            <div className="wk-x-actions"><button type="button" className="wk-btn" data-primary data-sm disabled={busy || !draft.trim()} onClick={() => void save()}>Kaydet</button><button type="button" className="wk-btn" data-sm onClick={() => { setEdit(false); setDraft(c.body); }}>Vazgeç</button></div>
          </div>
        ) : <MdLite text={c.body} />}
        {can && !edit && (
          <div className="wk-x-actions">
            {mine && <button type="button" className="wk-x-link" onClick={() => { setDraft(c.body); setEdit(true); }}><Pencil size={12} aria-hidden />Düzenle</button>}
            {ask ? (
              <span className="wk-x-confirm" role="group" aria-label="Yorumu silme onayı">
                <button type="button" className="wk-btn" data-sm autoFocus disabled={busy} onClick={() => void x.exec('comments', `cm:${c.id}`, () => repo.deleteComment(c.id), ['Yorum silindi']).then((r) => { if (r.ok) x.setComments((cs) => cs && cs.filter((y) => y.id !== c.id)); })}>Sil</button>
                <button type="button" className="wk-btn" data-sm onClick={() => setAsk(false)}>Vazgeç</button>
              </span>
            ) : <button type="button" className="wk-x-link" onClick={() => setAsk(true)}><Trash2 size={12} aria-hidden />Sil</button>}
          </div>
        )}
      </div>
    </li>
  );
}

export function CommentsSection({ x, repo, taskId, me, canEdit }: { x: TaskExtras; repo: Repo; taskId: string; me: Me | null; canEdit: boolean }) {
  const id = useId();
  const [body, setBody] = useState('');
  const comments = x.comments ?? [];
  const send = async () => {
    const b = body.trim();
    if (!b) return;
    const r = await x.exec('comments', 'cm-add', () => repo.addComment(taskId, b), ['Yorum eklendi']);
    if (r.ok) { setBody(''); x.setComments((cs) => [...(cs ?? []), r.value]); }
  };
  return (
    <div className="wk-x-pane">
      {x.errors.comments && <p role="alert" className="wk-detail-note" data-tone="error">{x.errors.comments}</p>}
      {comments.length === 0 ? <p className="wk-muted">Henüz yorum yok.</p> : <ol className="wk-x-comments" aria-label="Yorumlar">{comments.map((c) => <Comment key={c.id} c={c} x={x} repo={repo} me={me} canEdit={canEdit} />)}</ol>}
      {canEdit && (
        <form className="wk-x-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label htmlFor={`${id}-n`} className="wk-sr">Yorum yaz</label>
          <textarea id={`${id}-n`} className="wk-field wk-x-ta" rows={3} placeholder="Yorum yaz… (@ad ile anabilirsin · Ctrl/⌘+Enter gönderir)" maxLength={20000} value={body} disabled={x.busy.has('cm-add')}
            onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
          <div className="wk-x-actions"><button type="submit" className="wk-btn" data-primary data-sm disabled={!body.trim() || x.busy.has('cm-add')}>Yorum ekle</button></div>
        </form>
      )}
    </div>
  );
}
