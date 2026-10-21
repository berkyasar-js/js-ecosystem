'use client';
import { useId, useRef, useState } from 'react';
import { Download, ExternalLink, File as FileIcon, FileText, Image as ImageIcon, Link2, Paperclip, Trash2 } from 'lucide-react';
import { MAX_ATTACHMENT_BYTES, type TaskAttachment } from '@jscore/contracts';
import type { Repo } from '@/lib/repo/types';
import { fmtDate } from '../ui';
import { fmtBytes, isImage, resolveUrl, useAttachmentUrl, type TaskExtras } from './use-task-extras';

const iconOf = (a: TaskAttachment) => (isImage(a) ? ImageIcon : a.mime.startsWith('text/') || /pdf|word|sheet|presentation/.test(a.mime) ? FileText : a.url && !a.storage_path ? Link2 : FileIcon);

function Preview({ repo, a }: { repo: Repo; a: TaskAttachment }) {
  const url = useAttachmentUrl(repo, isImage(a) ? a : null);
  const Icon = iconOf(a);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="wk-x-thumb" src={url} alt="" loading="lazy" /> : <span className="wk-x-thumb wk-x-ficon" aria-hidden><Icon size={20} /></span>;
}

function Row({ a, x, repo, canEdit, onGone }: { a: TaskAttachment; x: TaskExtras; repo: Repo; canEdit: boolean; onGone: () => void }) {
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busy = x.busy.has(`at:${a.id}`);
  const openIt = async (download: boolean) => {
    setErr(null);
    const u = await resolveUrl(repo, a, download);
    if (!u) { setErr('Dosya adresi alınamadı'); return; }
    if (download) { const l = document.createElement('a'); l.href = u; l.download = a.name; l.rel = 'noopener'; l.click(); }
    else window.open(u, '_blank', 'noopener,noreferrer');
  };
  return (
    <li className="wk-x-file" aria-busy={busy}>
      <Preview repo={repo} a={a} />
      <div className="wk-x-fmeta">
        <strong title={a.name}>{a.name}</strong>
        <small className="wk-muted">{[fmtBytes(a.bytes), fmtDate(a.created_at), a.storage_path ? '' : 'bağlantı', a.external_id ? 'Trello' : ''].filter(Boolean).join(' · ')}</small>
        {err && <small role="alert" data-tone="error" style={{ color: 'var(--js-danger)' }}>{err}</small>}
      </div>
      <div className="wk-x-actions">
        <button type="button" className="wk-ib wk-x-ib" aria-label={`${a.name} dosyasını aç`} onClick={() => void openIt(false)}><ExternalLink size={14} aria-hidden /></button>
        {(a.storage_path || a.url) && <button type="button" className="wk-ib wk-x-ib" aria-label={`${a.name} dosyasını indir`} onClick={() => void openIt(true)}><Download size={14} aria-hidden /></button>}
        {canEdit && (ask ? (
          <span className="wk-x-confirm" role="group" aria-label="Dosya silme onayı">
            <button type="button" className="wk-btn" data-sm autoFocus disabled={busy} onClick={() => void x.exec('files', `at:${a.id}`, () => repo.deleteAttachment(a.id), ['Dosya silindi', a.name]).then((r) => { if (r.ok) { x.setFiles((fs) => fs && fs.filter((f) => f.id !== a.id)); onGone(); } })}>Sil</button>
            <button type="button" className="wk-btn" data-sm onClick={() => setAsk(false)}>Vazgeç</button>
          </span>
        ) : <button type="button" className="wk-ib wk-x-ib" aria-label={`${a.name} dosyasını sil`} onClick={() => setAsk(true)}><Trash2 size={14} aria-hidden /></button>)}
      </div>
    </li>
  );
}

export function FilesSection({ x, repo, taskId, canEdit, coverId, onCoverCleared }: { x: TaskExtras; repo: Repo; taskId: string; canEdit: boolean; coverId?: string | null; onCoverCleared?: () => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const files = x.files ?? [];
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const f of Array.from(list)) {
      if (f.size > MAX_ATTACHMENT_BYTES) { x.exec('files', `up:${f.name}`, async () => { throw new Error(`${f.name}: 25 MB sınırını aşıyor`); }); continue; }
      const r = await x.exec('files', `up:${f.name}`, () => repo.addAttachment(taskId, { file: f, name: f.name, mime: f.type }), ['Dosya yüklendi', f.name]);
      if (r.ok) x.setFiles((fs) => [...(fs ?? []), r.value]);
    }
    if (input.current) input.current.value = '';
  };
  const uploading = [...x.busy].some((k) => k.startsWith('up:'));
  return (
    <div className="wk-x-pane">
      {x.errors.files && <p role="alert" className="wk-detail-note" data-tone="error">{x.errors.files}</p>}
      {files.length === 0 ? <p className="wk-muted">Henüz dosya yok.</p> : <ul className="wk-x-files" aria-label="Dosyalar">{files.map((a) => <Row key={a.id} a={a} x={x} repo={repo} canEdit={canEdit} onGone={() => { if (coverId === a.id) onCoverCleared?.(); }} />)}</ul>}
      {canEdit && (
        <>
          <div className="wk-x-actions">
            <input ref={input} id={`${id}-f`} type="file" multiple hidden onChange={(e) => void upload(e.target.files)} />
            <button type="button" className="wk-btn" data-sm disabled={uploading} aria-busy={uploading} onClick={() => input.current?.click()}><Paperclip size={14} aria-hidden />{uploading ? 'Yükleniyor…' : 'Dosya yükle'}</button>
            <span className="wk-muted" style={{ fontSize: 12 }}>En çok 25 MB</span>
          </div>
          <form className="wk-x-addrow" onSubmit={(e) => { e.preventDefault(); void x.exec('files', 'link', () => repo.addAttachment(taskId, { url }), ['Bağlantı eklendi', url]).then((r) => { if (r.ok) { setUrl(''); x.setFiles((fs) => [...(fs ?? []), r.value]); } }); }}>
            <label className="wk-sr" htmlFor={`${id}-u`}>Bağlantı adresi</label>
            <input id={`${id}-u`} type="url" className="wk-field" placeholder="https://… bağlantı ekle" value={url} onChange={(e) => setUrl(e.target.value)} disabled={x.busy.has('link')} />
            <button type="submit" className="wk-btn" data-sm disabled={!url.trim() || x.busy.has('link')}><Link2 size={14} aria-hidden />Ekle</button>
          </form>
        </>
      )}
    </div>
  );
}
