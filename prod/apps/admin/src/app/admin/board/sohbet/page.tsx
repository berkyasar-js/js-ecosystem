'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, FileText, Paperclip, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { BOARD_ATTACHMENT_MAX_BYTES, BOARD_MESSAGE_MAX_BYTES, type BoardApplyResult, type BoardAttachment, type BoardMessage, type BoardPlan, type BoardThread } from '@jscore/contracts';
import { APP_URL } from '@/components/admin-shell';
import { CapMeter } from '@/components/cap-meter';
import { MdLite } from '@/components/md/md-lite';
import { useToast } from '@/components/toasts';
import { Empty, Loading, PageHeader, PRIORITY, fmtTime } from '@/components/ui';
import { errText } from '@/components/admin-ui';
import { api, useApi } from '@/lib/client';

interface Ctx { today: string; projects: Array<{ id: string; name: string; status: string; brand_id: string }>; brands: Array<{ id: string; name: string; client_id: string; status: string }>; employees: Array<{ id: string; code: string | null; name: string; role_title: string }> }
type Draft = { name: string; text: string; bytes: number };

const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 4 : 2)}`;
const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const CostChip = ({ m }: { m: Pick<BoardMessage, 'tokens_in' | 'tokens_out' | 'cost_usd'> & { demo?: boolean } }) => (
  <span className="chip" title="Girdi / çıktı jeton · maliyet">{m.demo ? 'demo' : `${tokens(m.tokens_in)} / ${tokens(m.tokens_out)} · ${usd(Number(m.cost_usd))}`}</span>
);

export default function BoardChatPage() {
  const threadsQ = useApi<{ threads: BoardThread[]; mode: 'demo' | 'supabase' }>('/api/admin/board/chat/threads');
  const ctxQ = useApi<Ctx>('/api/admin/board/chat/context');
  const [sel, setSel] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const threads = useMemo(() => (threadsQ.data?.threads ?? []).filter((t) => showArchived || t.status === 'open'), [threadsQ.data, showArchived]);
  useEffect(() => { if (!sel && threads[0]) setSel(threads[0].id); }, [threads, sel]);
  const current = threadsQ.data?.threads.find((t) => t.id === sel) ?? null;

  const newThread = async () => {
    try { const r = await api<{ thread: BoardThread }>('/api/admin/board/chat/threads', { method: 'POST', body: JSON.stringify({ title: 'Yeni konu' }) }); setErr(null); threadsQ.reload(); setSel(r.thread.id); } catch (e) { setErr(errText(e)); }
  };
  const patchThread = async (id: string, body: { title?: string; status?: 'open' | 'archived' }) => {
    try { await api(`/api/admin/board/chat/threads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); setErr(null); threadsQ.reload(); } catch (e) { setErr(errText(e)); }
  };
  const deleteThread = async (id: string) => {
    if (!confirm('Konu ve tüm mesajları silinsin mi? Bu işlem geri alınamaz.')) return;
    try { await api(`/api/admin/board/chat/threads/${id}`, { method: 'DELETE' }); setErr(null); if (sel === id) setSel(null); threadsQ.reload(); } catch (e) { setErr(errText(e)); }
  };

  return (
    <>
      <PageHeader eyebrow="Yönetim Kurulu" title="Kurul Sohbeti" sub="Fikrini yaz ya da brief dosyanı ekle; kurul (CHAIR + CEO/CFO/COO/CMO/CTO/CHRO/CCO/CLO) görev dağılımı ve yapılacaklar listesi üretir" actions={<><Link href="/admin/board" className="btn">Kurul kararları</Link><button className="btn btn-primary" onClick={newThread}><Plus size={16} aria-hidden /> Yeni konu</button></>} />
      <CapMeter className="mb-4 max-w-xl" />
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      {threadsQ.error && <p role="alert" className="mb-3 text-sm text-magenta">{threadsQ.error}</p>}
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="card !p-3" aria-label="Konular">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-sm font-bold">Konular</h2>
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Arşiv</label>
          </div>
          {threadsQ.loading ? <Loading rows={3} /> : threads.length === 0 ? <Empty>Henüz konu yok.</Empty> : (
            <ul className="grid gap-1">
              {threads.map((t) => (
                <li key={t.id}>
                  <button className={`w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-line/40 ${t.id === sel ? 'bg-line/60' : ''}`} aria-current={t.id === sel ? 'true' : undefined} onClick={() => setSel(t.id)}>
                    <div className="truncate font-semibold">{t.title}</div>
                    <div className="text-xs text-muted">{fmtTime(t.updated_at)}{t.status === 'archived' && ' · arşiv'}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="min-w-0">
          {current ? <Thread key={current.id} thread={current} ctx={ctxQ.data} onRename={(title) => patchThread(current.id, { title })} onArchive={() => patchThread(current.id, { status: current.status === 'open' ? 'archived' : 'open' })} onDelete={() => deleteThread(current.id)} onThreadChanged={threadsQ.reload} /> : !threadsQ.loading && <Empty>Soldan bir konu seç ya da <button className="underline" onClick={newThread}>yeni konu</button> aç.</Empty>}
        </section>
      </div>
    </>
  );
}

function Thread({ thread, ctx, onRename, onArchive, onDelete, onThreadChanged }: { thread: BoardThread; ctx: Ctx | null; onRename(t: string): void; onArchive(): void; onDelete(): void; onThreadChanged(): void }) {
  const q = useApi<{ thread: BoardThread; messages: BoardMessage[] }>(`/api/admin/board/chat/threads/${thread.id}/messages`);
  const [messages, setMessages] = useState<BoardMessage[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(thread.title);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (q.data) setMessages(q.data.messages); }, [q.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, busy]);
  const total = messages.reduce((s, m) => s + Number(m.cost_usd), 0);
  const totalIn = messages.reduce((s, m) => s + m.tokens_in, 0), totalOut = messages.reduce((s, m) => s + m.tokens_out, 0);

  const send = useCallback(async (content: string, attachments: Draft[]) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ user: BoardMessage; assistant: BoardMessage }>(`/api/admin/board/chat/threads/${thread.id}/messages`, { method: 'POST', body: JSON.stringify({ content, attachments: attachments.map((a) => ({ name: a.name, text: a.text })) }) });
      setMessages((cur) => [...cur, r.user, r.assistant]);
      onThreadChanged();
      return true;
    } catch (e) { setErr(errText(e)); return false; } finally { setBusy(false); }
  }, [thread.id, onThreadChanged]);

  return (
    <div className="grid gap-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 !py-3">
        {renaming ? (
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); onRename(title.trim() || thread.title); setRenaming(false); }}>
            <input className="input" aria-label="Konu başlığı" value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
            <button className="btn btn-sm btn-primary">Kaydet</button><button type="button" className="btn btn-sm" onClick={() => { setTitle(thread.title); setRenaming(false); }}>Vazgeç</button>
          </form>
        ) : (
          <div className="min-w-0"><h2 className="truncate font-bold">{thread.title}</h2><div className="text-xs text-muted">{messages.length} mesaj · {tokens(totalIn)} / {tokens(totalOut)} jeton · toplam {usd(total)}{thread.summary ? ' · eski mesajlar özetlendi' : ''}</div></div>
        )}
        <div className="flex gap-2">
          <button className="btn btn-sm" onClick={() => setRenaming(true)} aria-label="Yeniden adlandır"><Pencil size={14} aria-hidden /> Adlandır</button>
          <button className="btn btn-sm" onClick={onArchive}>{thread.status === 'open' ? <><Archive size={14} aria-hidden /> Arşivle</> : <><ArchiveRestore size={14} aria-hidden /> Geri aç</>}</button>
          <button className="btn btn-sm" onClick={onDelete} aria-label="Konuyu sil"><Trash2 size={14} aria-hidden /></button>
        </div>
      </div>

      {q.loading ? <Loading rows={2} /> : q.error ? <p role="alert" className="text-sm text-magenta">{q.error}</p> : messages.length === 0 ? (
        <Empty>Kurula bir fikir yaz ya da brief (.md/.txt) ekle. Yeterli bilgi olduğunda görev dağılımı ve yapılacaklar listesi çıkar.</Empty>
      ) : (
        <ol className="grid gap-3" aria-live="polite">
          {messages.map((m) => <li key={m.id}><Message m={m} threadId={thread.id} ctx={ctx} /></li>)}
          {busy && <li className="nested text-sm text-muted" aria-busy="true">Kurul toplanıyor…</li>}
          <div ref={endRef} />
        </ol>
      )}
      {err && <p role="alert" className="text-sm text-magenta">{err}</p>}
      {thread.status === 'open' ? <Composer busy={busy} onSend={send} /> : <p className="text-sm text-muted">Arşivlenmiş konu — yazmak için “Geri aç”.</p>}
    </div>
  );
}

function Message({ m, threadId, ctx }: { m: BoardMessage; threadId: string; ctx: Ctx | null }) {
  const mine = m.role === 'user';
  return (
    <article className={`card ${mine ? 'ml-0 lg:ml-16' : 'mr-0 lg:mr-16'}`} aria-label={mine ? 'Kurucu mesajı' : 'Kurul yanıtı'}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span><strong className={mine ? '' : 'text-[#3ddc97]'}>{mine ? 'Sen' : 'Kurul · CHAIR'}</strong> · {fmtTime(m.created_at)}</span>
        {!mine && <CostChip m={m} />}
      </div>
      {m.content && <MdLite text={m.content} />}
      {m.attachments?.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">{m.attachments.map((a, i) => <li key={i}><AttachmentChip a={a} /></li>)}</ul>
      )}
      {m.plan && <PlanCard plan={m.plan} threadId={threadId} messageId={m.id} ctx={ctx} />}
    </article>
  );
}

function AttachmentChip({ a }: { a: BoardAttachment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}><FileText size={12} aria-hidden /> {a.name} · {Math.max(1, Math.round(a.bytes / 1024))} KB</button>
      {open && <pre className="nested mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{a.text}</pre>}
    </>
  );
}

function Composer({ busy, onSend }: { busy: boolean; onSend(content: string, attachments: Draft[]): Promise<boolean> }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Draft[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const canSend = !busy && (text.trim().length > 0 || files.length > 0);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setErr(null);
    Array.from(list).forEach((f) => {
      if (!/\.(md|markdown|txt)$/i.test(f.name)) { setErr(`Yalnızca .md / .txt: ${f.name}`); return; }
      if (f.size > BOARD_ATTACHMENT_MAX_BYTES) { setErr(`${f.name} çok büyük (sınır ${BOARD_ATTACHMENT_MAX_BYTES / 1024} KB)`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const t = String(reader.result ?? '');
        const bytes = new TextEncoder().encode(t).length;
        setFiles((cur) => {
          if (cur.some((x) => x.name === f.name)) return cur;
          if (cur.reduce((s, x) => s + x.bytes, 0) + bytes > BOARD_MESSAGE_MAX_BYTES) { setErr(`Ekler toplamı ${BOARD_MESSAGE_MAX_BYTES / 1024} KB sınırını aşıyor`); return cur; }
          return [...cur, { name: f.name, text: t, bytes }];
        });
      };
      reader.readAsText(f);
    });
    if (fileRef.current) fileRef.current.value = '';
  };
  const submit = async () => { if (!canSend) return; const ok = await onSend(text, files); if (ok) { setText(''); setFiles([]); } };

  return (
    <form className="card grid gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-label="Kurula yaz">
      <textarea className="input min-h-28 resize-y" placeholder="Fikrini, projeni ya da sorunu yaz… (Ctrl/⌘ + Enter gönderir)" aria-label="Mesaj" value={text} disabled={busy} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void submit(); } }} />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">{files.map((f) => (
          <li key={f.name} className="chip"><FileText size={12} aria-hidden /> {f.name} · {Math.max(1, Math.round(f.bytes / 1024))} KB <button type="button" aria-label={`${f.name} dosyasını kaldır`} onClick={() => setFiles((cur) => cur.filter((x) => x.name !== f.name))}><X size={12} /></button></li>
        ))}</ul>
      )}
      {err && <p role="alert" className="text-xs text-magenta">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple className="hidden" id="board-file" onChange={(e) => addFiles(e.target.files)} />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip size={14} aria-hidden /> Dosya ekle (.md/.txt)</button>
          {total > 0 && <span className="text-xs text-muted">{Math.round(total / 1024)} / {BOARD_MESSAGE_MAX_BYTES / 1024} KB</span>}
        </div>
        <button className="btn btn-accent" disabled={!canSend}>{busy ? 'Kurul toplanıyor…' : <><Send size={14} aria-hidden /> Kurula gönder</>}</button>
      </div>
    </form>
  );
}

function PlanCard({ plan, threadId, messageId, ctx }: { plan: BoardPlan; threadId: string; messageId: string; ctx: Ctx | null }) {
  const toast = useToast();
  const [checked, setChecked] = useState<boolean[]>(() => plan.tasks.map(() => true));
  const [project, setProject] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<BoardApplyResult | null>(null);
  const projects = useMemo(() => (ctx?.projects ?? []).filter((p) => p.status === 'active' || p.status === 'planning'), [ctx]);
  useEffect(() => { if (!project && projects[0]) setProject(projects[0].id); }, [projects, project]);
  useEffect(() => { if (!brand && ctx?.brands[0]) setBrand(ctx.brands[0].id); }, [ctx, brand]);
  const isNew = project === '__new__';
  const n = checked.filter(Boolean).length;
  const canApply = !busy && n > 0 && (isNew ? newName.trim().length >= 2 : !!project);

  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { message_id: messageId, task_indexes: checked.map((c, i) => (c ? i : -1)).filter((i) => i >= 0), ...(isNew ? { new_project: { name: newName.trim(), brand_id: brand || undefined } } : { project_id: project }) };
      const r = await api<BoardApplyResult>(`/api/admin/board/chat/threads/${threadId}/apply`, { method: 'POST', body: JSON.stringify(body) });
      setResult(r);
      toast.success(r.demo ? `Demo: ${r.created} görev aktarılırdı` : `${r.created} görev sisteme aktarıldı`, `${r.project_name}${r.unmatched_assignees.length ? ` · eşleşmeyen: ${r.unmatched_assignees.join(', ')}` : ''}`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <section className="nested mt-4 grid gap-4" aria-label="Kurul planı">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Plan</h3><span className="chip chip-brand">{plan.tasks.length} görev · {plan.assignments.length} kişi</span></div>
      {plan.summary && <p className="text-sm">{plan.summary}</p>}
      {plan.assumptions.length > 0 && <Block title="Varsayımlar"><ul className="list-disc pl-5 text-sm">{plan.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></Block>}
      {plan.questions.length > 0 && <Block title="Açık sorular (kurucuya)"><ul className="list-disc pl-5 text-sm">{plan.questions.map((a, i) => <li key={i}>{a}</li>)}</ul></Block>}
      {plan.assignments.length > 0 && (
        <Block title="Görev dağılımı">
          <div className="overflow-x-auto"><table className="table text-sm"><thead><tr><th>Kişi</th><th>Rol</th><th>Sorumluluk</th><th>Yük</th></tr></thead><tbody>
            {plan.assignments.map((a, i) => <tr key={i}><td><strong>{a.employee_name}</strong>{a.employee_code ? <span className="ml-1 text-xs text-muted">({a.employee_code})</span> : null}</td><td>{a.role_title || '—'}</td><td>{a.responsibility}</td><td>{a.workload_pct != null ? `%${a.workload_pct}` : '—'}</td></tr>)}
          </tbody></table></div>
        </Block>
      )}
      {plan.tasks.length > 0 && (
        <Block title={`Yapılacaklar (${n}/${plan.tasks.length} seçili)`} action={<button type="button" className="btn btn-sm" onClick={() => setChecked(plan.tasks.map(() => n !== plan.tasks.length))}>{n === plan.tasks.length ? 'Hiçbirini seçme' : 'Tümünü seç'}</button>}>
          <ul className="grid gap-2">
            {plan.tasks.map((t, i) => {
              const [pl, pc] = PRIORITY[t.priority] ?? PRIORITY.normal;
              return (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={checked[i] ?? false} aria-label={`${t.title} görevini seç`} onChange={(e) => setChecked((c) => c.map((x, j) => (j === i ? e.target.checked : x)))} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><strong>{t.title}</strong><span className={`chip ${pc}`}>{pl}</span>{t.phase && <span className="chip">{t.phase}</span>}</div>
                    {t.description && <p className="mt-1 text-muted">{t.description}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                      <span>Atanan: <strong>{t.assignee_name || '—'}</strong></span><span>Tahmin: {Math.round(t.estimate_minutes / 60 * 10) / 10} sa</span>{t.due_in_days != null && <span>Teslim: +{t.due_in_days} gün</span>}{t.depends_on.length > 0 && <span>Bağımlı: {t.depends_on.join(', ')}</span>}
                    </div>
                    {t.acceptance.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{t.acceptance.map((a, j) => <li key={j}>{a}</li>)}</ul>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      )}
      {(plan.milestones?.length ?? 0) > 0 && <Block title="Kilometre taşları"><ul className="grid gap-1 text-sm">{plan.milestones!.map((m, i) => <li key={i}><strong>{m.name}</strong> <span className="chip">+{m.due_in_days} gün</span>{m.tasks.length > 0 && <span className="ml-2 text-xs text-muted">{m.tasks.join(' · ')}</span>}</li>)}</ul></Block>}
      {(plan.risks?.length ?? 0) > 0 && <Block title="Riskler"><ul className="grid gap-1 text-sm">{plan.risks!.map((r, i) => <li key={i}><strong>{r.risk}</strong> — {r.mitigation}{r.owner && <span className="ml-1 text-xs text-muted">({r.owner})</span>}</li>)}</ul></Block>}

      {plan.tasks.length > 0 && (
        <div className="grid gap-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor={`prj-${messageId}`}>Proje</label>
              <select id={`prj-${messageId}`} className="input" value={project} onChange={(e) => setProject(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__new__">Yeni proje…</option>
              </select></div>
            {isNew && (
              <>
                <div><label className="label" htmlFor={`np-${messageId}`}>Yeni proje adı</label><input id={`np-${messageId}`} className="input" value={newName} maxLength={200} placeholder="Proje adı" onChange={(e) => setNewName(e.target.value)} /></div>
                <div><label className="label" htmlFor={`br-${messageId}`}>Marka</label>
                  <select id={`br-${messageId}`} className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>{(ctx?.brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                  {ctx && ctx.brands.length === 0 && <p className="mt-1 text-xs text-magenta">Önce bir marka tanımlanmalı.</p>}</div>
              </>
            )}
          </div>
          {err && <p role="alert" className="text-sm text-magenta">{err}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={!canApply} onClick={() => void apply()}>{busy ? 'Aktarılıyor…' : `Seçili görevleri sisteme aktar (${n})`}</button>
            {result && <span className="text-sm text-muted">{result.demo ? 'Demo modu — kayıt yazılmadı.' : <>{result.created} görev oluşturuldu → <strong>{result.project_name}</strong>.</>}{result.unmatched_assignees.length > 0 && <> Eşleşmeyen kişi: {result.unmatched_assignees.join(', ')} (atanmadan oluşturuldu).</>}{APP_URL && !result.demo && <> <a className="underline" href={`${APP_URL}/app/tasks`} target="_blank" rel="noreferrer">Görevleri aç</a></>}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div><div className="mb-1.5 flex items-center justify-between gap-2"><h4 className="label !mb-0">{title}</h4>{action}</div>{children}</div>;
}
