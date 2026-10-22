'use client';
import { useEffect, useId, useState } from 'react';
import { COVER_COLORS, COVER_COLOR_LABELS, type AuditEvent, type Task, type TaskCover } from '@jscore/contracts';
import type { Repo } from '@jscore/core/repo/types';
import { fmtTime } from '../ui';
import { MdLite } from './md-lite';
import { isImage, useAttachmentUrl, type TaskExtras } from './use-task-extras';

/** Açıklama: görünümde markdown-lite, düzenlemede textarea; odak kaybında (blur) otomatik kayıt. Hatada metin korunur (üstteki panel hatayı gösterir). */
export function DescriptionSection({ task, canEdit, pending, onSave }: { task: Task; canEdit: boolean; pending: boolean; onSave: (description: string) => void }) {
  const id = useId();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(task.description ?? '');
  useEffect(() => { if (!edit) setDraft(task.description ?? ''); }, [task.description, task.id, edit]);
  const commit = () => {
    setEdit(false);
    if (draft !== (task.description ?? '') && (draft.trim() !== '' || (task.description ?? '') !== '')) onSave(draft.trim() === '' ? '' : draft);
  };
  if (!edit) {
    const has = !!task.description?.trim();
    return (
      <div className="wk-x-pane">
        {has ? <MdLite text={task.description!} /> : <p className="wk-muted">Açıklama yok.</p>}
        {canEdit && <div className="wk-x-actions"><button type="button" className="wk-btn" data-sm disabled={pending} onClick={() => setEdit(true)}>{has ? 'Açıklamayı düzenle' : 'Açıklama ekle'}</button></div>}
      </div>
    );
  }
  return (
    <div className="wk-x-pane">
      <label htmlFor={`${id}-d`} className="wk-sr">Görev açıklaması</label>
      <textarea id={`${id}-d`} className="wk-field wk-x-ta" rows={8} autoFocus maxLength={20000} value={draft} placeholder="Açıklama… (**kalın**, *italik*, `kod`, - liste, bağlantılar)" onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDraft(task.description ?? ''); setEdit(false); } }} />
      <p className="wk-muted" style={{ fontSize: 12 }}>Odaktan çıkınca otomatik kaydedilir · Esc ile vazgeç.</p>
    </div>
  );
}

export function CoverSection({ task, x, repo, canEdit, onCover }: { task: Task; x: TaskExtras; repo: Repo; canEdit: boolean; onCover: (c: TaskCover) => void }) {
  const current = task.cover?.attachment_id ? `a:${task.cover.attachment_id}` : task.cover?.color ? `c:${task.cover.color}` : '';
  const images = (x.files ?? []).filter(isImage);
  return (
    <div className="wk-x-pane">
      <fieldset className="wk-x-fieldset">
        <legend>Renk</legend>
        <div className="wk-x-swatches" role="radiogroup" aria-label="Kapak rengi">
          {COVER_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={current === `c:${c}`} aria-label={COVER_COLOR_LABELS[c]} title={COVER_COLOR_LABELS[c]} className="wk-x-swatch" data-cover={c} disabled={!canEdit} onClick={() => onCover({ color: c })} />
          ))}
        </div>
      </fieldset>
      <fieldset className="wk-x-fieldset">
        <legend>Görsel ek</legend>
        {images.length === 0 ? <p className="wk-muted">Kapak yapılabilecek görsel ek yok. Dosyalar sekmesinden bir görsel yükle.</p> : (
          <div className="wk-x-imgs" role="radiogroup" aria-label="Kapak görseli">
            {images.map((a) => <ImgChoice key={a.id} repo={repo} a={a} on={current === `a:${a.id}`} disabled={!canEdit} onPick={() => onCover({ attachment_id: a.id })} />)}
          </div>
        )}
      </fieldset>
      {canEdit && current && <div className="wk-x-actions"><button type="button" className="wk-btn" data-sm onClick={() => onCover({})}>Kapağı kaldır</button></div>}
    </div>
  );
}
function ImgChoice({ repo, a, on, disabled, onPick }: { repo: Repo; a: Parameters<typeof useAttachmentUrl>[1] & { id: string; name: string }; on: boolean; disabled: boolean; onPick: () => void }) {
  const url = useAttachmentUrl(repo, a);
  return (
    <button type="button" role="radio" aria-checked={on} className="wk-x-imgchoice" aria-label={`${a.name} görselini kapak yap`} disabled={disabled} onClick={onPick}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="wk-muted">…</span>}
    </button>
  );
}

export interface ActivityItem { key: string; at: string; who: string; text: string }
/** Aktivite: denetim kayıtları (yetki varsa) + yorumlar + dosya eklemeleri; yeni → eski. */
export function ActivitySection({ audit, x }: { audit: AuditEvent[] | null; x: TaskExtras }) {
  const items: ActivityItem[] = [
    ...(audit ?? []).map((a) => ({ key: `a:${a.id}`, at: a.occurred_at, who: a.actor_name, text: a.action })),
    ...(x.comments ?? []).map((c) => ({ key: `c:${c.id}`, at: c.created_at, who: c.author_name, text: `yorum: ${c.body.slice(0, 90)}${c.body.length > 90 ? '…' : ''}` })),
    ...(x.files ?? []).map((f) => ({ key: `f:${f.id}`, at: f.created_at, who: f.uploaded_by ? '' : 'Trello', text: `dosya eklendi: ${f.name}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
  return (
    <div className="wk-x-pane">
      {audit === null && <p className="wk-muted">Denetim kaydını görme yetkin yok; yorum ve dosya hareketleri gösteriliyor.</p>}
      {items.length === 0 ? <p className="wk-muted">Bu görev için henüz etkinlik yok.</p>
        : <ul className="wk-activity">{items.map((a) => <li key={a.key}>{a.who && <strong>{a.who}</strong>}{a.who && ' · '}{a.text}<small>{fmtTime(a.at)}</small></li>)}</ul>}
    </div>
  );
}
