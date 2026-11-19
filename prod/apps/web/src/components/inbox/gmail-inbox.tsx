'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Building2, Link2, Mail, Paperclip, RefreshCw, Reply, Send, UserPlus } from 'lucide-react';
import { MAIL_FILTER_LABELS, mailCounts, type Brand, type MailFilter, type MailMessage, type MailThread } from '@jscore/contracts';
import { Async, Empty, Loading, fmtTime, useData } from '@/components/ui';
import { useSession } from '@/components/session';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';
interface ListRes { connected: boolean; mailbox: string | null; gmail_scope: boolean; last_sync_at: string | null; threads: MailThread[] }
interface ThreadRes { thread: MailThread; messages: MailMessage[] }
const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `İşlem başarısız (${r.status})`);
  return j;
};
const FILTERS: MailFilter[] = ['all', 'matched', 'unmatched', 'unread'];

/** Gelen Kutusu → E-posta (0021): org posta kutusundaki konular (Gmail → CRM eşlemesi), konu görünümü, müşteriye bağla / kişi ekle / göreve dönüştür / yanıtla / arşivle. */
export function GmailInbox() {
  const { me, bump } = useSession();
  const crm = useData(async (r) => ({ brands: await r.listBrands().catch(() => [] as Brand[]) }));
  const [filter, setFilter] = useState<MailFilter>('all');
  const [archived, setArchived] = useState(false);
  const [list, setList] = useState<ListRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api<ListRes>(`/api/mail/threads?archived=${archived ? 1 : 0}&limit=200`)); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setLoading(false); }
  }, [archived]);
  useEffect(() => { void load(); }, [load]);
  const threads = useMemo(() => (list?.threads ?? []).filter((t) => (filter === 'matched' ? !!t.client_id : filter === 'unmatched' ? !t.client_id : filter === 'unread' ? t.unread : true)), [list, filter]);
  const counts = mailCounts(list?.threads ?? []);
  const canWrite = !!me && ['owner', 'org_admin', 'operations', 'account', 'pm'].includes(me.role);
  const patchThread = (t: MailThread) => setList((l) => (l ? { ...l, threads: l.threads.map((x) => (x.id === t.id ? t : x)) } : l));

  if (loading && !list) return <Loading rows={4} />;
  if (err && !list) return <p role="alert" className="text-sm text-magenta">{err}</p>;
  if (list && !list.connected) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="signal-icon"><Mail size={16} aria-hidden /></span>
          <div><strong>Gmail bağlı değil</strong><p className="text-sm text-muted">Ajans posta kutusu (hello@) bağlanınca gelen e-postalar müşteri / kişiyle eşlenip burada listelenir; yanıt ve arşiv Gmail’e yazılır.</p></div></div>
        {ADMIN_URL && canWrite ? <a className="btn btn-sm" href={`${ADMIN_URL}/admin/integrations`} target="_blank" rel="noreferrer">Google Workspace’i bağla</a> : <span className="text-xs text-muted">Bağlantı Ana Yönetim Paneli → Entegrasyonlar’dan yapılır.</span>}
      </section>
    );
  }
  return (
    <Async q={crm}>{({ brands }) => (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{MAIL_FILTER_LABELS[f]} {counts[f] > 0 && <span className="chip">{counts[f]}</span>}</button>)}
          <button className={`btn btn-sm ${archived ? 'btn-primary' : ''}`} aria-pressed={archived} onClick={() => { setArchived((v) => !v); setSel(null); }}><Archive size={14} aria-hidden /> Arşiv</button>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">{list?.mailbox}{list?.last_sync_at ? ` · eşitleme ${fmtTime(list.last_sync_at)}` : ''}<button className="btn btn-ghost btn-sm" onClick={() => void load()} aria-label="Yenile"><RefreshCw size={14} /></button></span>
        </div>
        {err && <p role="alert" className="text-sm text-magenta">{err}</p>}
        {list && !list.gmail_scope && <p className="text-sm text-magenta">Posta kutusu bağlı ama Gmail okuma kapsamı yok — panelden “Yeniden yetkilendir”.</p>}
        {threads.length === 0 ? <Empty>{archived ? 'Arşiv boş.' : filter === 'unread' ? 'Okunmamış e-posta yok.' : filter === 'unmatched' ? 'Eşleşmeyen e-posta yok.' : 'Henüz e-posta yok — eşitleme 10 dakikada bir çalışır.'}</Empty> : (
          <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
            <ul className="grid content-start gap-2" aria-label="E-posta konuları">
              {threads.map((t) => {
                const client = t.brand_id ? brands.find((b) => b.id === t.brand_id) : brands.find((b) => b.client_id === t.client_id);
                return (
                  <li key={t.id}>
                    <button onClick={() => setSel(t.id)} className={`nested w-full text-left ${sel === t.id ? 'ring-2 ring-accent' : ''}`} aria-current={sel === t.id ? 'true' : undefined}>
                      <div className="flex justify-between gap-2"><strong className={`truncate ${t.unread ? '' : 'font-medium'}`}>{t.unread && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" aria-label="Okunmamış" />}{t.from_name || t.from_email}</strong><span className="shrink-0 text-[11px] text-muted">{fmtTime(t.last_message_at)}</span></div>
                      <div className="truncate text-sm">{t.subject}{t.message_count > 1 && <span className="ml-1 text-xs text-muted">({t.message_count})</span>}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted"><span className="min-w-0 flex-1 truncate">{t.snippet}</span>{client ? <span className="chip chip-brand shrink-0">{client.name}</span> : <span className="chip shrink-0">Eşleşmedi</span>}{t.request_id && <span className="chip chip-ok shrink-0">Talep</span>}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {sel ? <ThreadView id={sel} key={sel} brands={brands} canWrite={canWrite} onChange={(t) => { patchThread(t); bump(); }} onGone={() => { setSel(null); void load(); }} /> : <Empty>Soldan bir konu seç.</Empty>}
          </div>
        )}
      </div>
    )}</Async>
  );
}

function ThreadView({ id, brands, canWrite, onChange, onGone }: { id: string; brands: Brand[]; canWrite: boolean; onChange(t: MailThread): void; onGone(): void }) {
  const [d, setD] = useState<ThreadRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  /** Seçilen marka (müşteri = markanın client_id'si; CRM'de birim marka). */
  const [linkBrand, setLinkBrand] = useState('');
  const linkClient = brands.find((b) => b.id === linkBrand)?.client_id ?? '';
  const [showLink, setShowLink] = useState(false);
  const act = useCallback(async <T,>(body: Record<string, unknown>) => api<T & { thread?: MailThread }>(`/api/mail/threads/${id}`, { method: 'POST', body: JSON.stringify(body) }), [id]);
  useEffect(() => {
    let alive = true;
    api<ThreadRes>(`/api/mail/threads/${id}`).then((r) => { if (!alive) return; setD(r); if (r.thread.unread) void act<{ thread: MailThread }>({ action: 'read' }).then((x) => { if (alive && x.thread) { setD((c) => (c ? { ...c, thread: x.thread! } : c)); onChange(x.thread); } }, () => undefined); }, (e: unknown) => alive && setErr(e instanceof Error ? e.message : 'Hata'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setErr(null); setNote(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(null); } };
  const apply = (r: { thread?: MailThread }) => { if (r.thread) { setD((c) => (c ? { ...c, thread: r.thread! } : c)); onChange(r.thread); } };
  if (err && !d) return <p role="alert" className="card text-sm text-magenta">{err}</p>;
  if (!d) return <Loading rows={5} />;
  const t = d.thread;
  const brand = brands.find((b) => b.id === t.brand_id) ?? (t.client_id ? brands.find((b) => b.client_id === t.client_id) : undefined);
  const client = t.client_id ? { name: brand?.name ?? 'Müşteri' } : null;
  return (
    <article className="card" aria-label="E-posta konusu">
      <header className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{t.subject}</h2>
          <div className="flex flex-wrap gap-1.5">
            {client ? <span className="chip chip-brand"><Building2 size={12} aria-hidden className="mr-1 inline" />{client.name}</span> : <span className="chip chip-warn">Müşteri eşleşmedi</span>}
            {t.archived && <span className="chip">Arşiv</span>}
            {t.request_id && <Link href="/app/requests" className="chip chip-ok">Talep oluşturuldu</Link>}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">{t.from_name ? `${t.from_name} <${t.from_email}>` : t.from_email} · {t.message_count} ileti · son {fmtTime(t.last_message_at)}</p>
      </header>
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      {note && <p role="status" className="mb-3 text-sm text-muted">{note}</p>}
      {canWrite && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-sm" disabled={!!busy} onClick={() => setShowLink((v) => !v)}><Link2 size={14} aria-hidden /> {client ? 'Müşteriyi değiştir' : 'Müşteriye bağla'}</button>
          {!t.request_id && <button className="btn btn-sm" disabled={!!busy} onClick={() => void run('convert', async () => { await act({ action: 'convert' }); const fresh = await api<ThreadRes>(`/api/mail/threads/${id}`); setD(fresh); onChange(fresh.thread); setNote('Talep oluşturuldu — Talepler’den göreve dönüştürebilirsin.'); })}>Göreve dönüştür</button>}
          {!t.archived && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void run('archive', async () => { await act({ action: 'archive' }); onGone(); })}><Archive size={14} aria-hidden /> Arşivle</button>}
        </div>
      )}
      {showLink && canWrite && (
        <form className="nested mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run('link', async () => { apply(await act({ action: 'link', client_id: linkClient || null, brand_id: linkBrand || null })); setShowLink(false); setNote(linkClient ? 'Müşteriye bağlandı.' : 'Bağ kaldırıldı.'); }); }}>
          <div><label className="label" htmlFor="mail-client">Müşteri / marka</label><select id="mail-client" className="input w-auto min-w-56" value={linkBrand} onChange={(e) => setLinkBrand(e.target.value)}><option value="">— bağ yok —</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <button className="btn btn-primary btn-sm" disabled={!!busy}>Kaydet</button>
          {t.from_email && !t.contact_id && <button type="button" className="btn btn-sm" disabled={!!busy || !linkClient} onClick={() => void run('contact', async () => { const r = await act<{ contact_id: string; rematched: number }>({ action: 'add_contact', client_id: linkClient, brand_id: linkBrand || null }); const fresh = await api<ThreadRes>(`/api/mail/threads/${id}`); setD(fresh); onChange(fresh.thread); setShowLink(false); setNote(`Kişi eklendi ve eşlendi${r.rematched ? ` · ${r.rematched} konu daha eşleşti` : ''}.`); })}><UserPlus size={14} aria-hidden /> Bağla + göndereni kişi olarak ekle</button>}
          <p className="text-xs text-muted">Kişi eklersen ({t.from_email}) aynı adresten gelen sonraki e-postalar kendiliğinden eşleşir.</p>
        </form>
      )}
      <ol className="grid gap-3" aria-label="İletiler">
        {d.messages.map((m) => (
          <li key={m.id} className={`nested ${m.outbound ? 'border-accent' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span><strong className="text-[var(--ink)]">{m.outbound ? 'Biz' : m.from_name || m.from_email}</strong> {m.from_name && !m.outbound ? `<${m.from_email}>` : ''} → {m.to_emails.join(', ')}{m.cc_emails.length ? ` · cc ${m.cc_emails.join(', ')}` : ''}</span>
              <span>{fmtTime(m.date)}</span>
            </div>
            {m.html_sanitized ? <div className="mail-html mt-2 text-sm" dangerouslySetInnerHTML={{ __html: m.html_sanitized }} /> : <p className="mt-2 whitespace-pre-wrap text-sm">{m.text}</p>}
            {m.attachments.length > 0 && <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted"><Paperclip size={12} aria-hidden />{m.attachments.map((a, i) => <span key={i} className="chip">{a.filename} · {Math.round(a.size / 1024)} KB</span>)}</p>}
          </li>
        ))}
      </ol>
      {canWrite && (
        <form className="mt-4 grid gap-2" onSubmit={(e) => { e.preventDefault(); void run('reply', async () => { await act({ action: 'reply', text: reply }); setReply(''); const fresh = await api<ThreadRes>(`/api/mail/threads/${id}`); setD(fresh); onChange(fresh.thread); setNote('Yanıt gönderildi (Gmail, aynı konu).'); }); }}>
          <label className="label" htmlFor="mail-reply"><Reply size={12} aria-hidden className="mr-1 inline" />Yanıtla</label>
          <textarea id="mail-reply" className="input min-h-24" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Merhaba, …" required minLength={2} />
          <div className="flex items-center gap-2"><button className="btn btn-primary btn-sm" disabled={!!busy || reply.trim().length < 2}><Send size={14} aria-hidden /> {busy === 'reply' ? 'Gönderiliyor…' : 'Gönder'}</button><span className="text-xs text-muted">Gönderen: ajans posta kutusu · In-Reply-To / References ile konu sürer.</span></div>
        </form>
      )}
    </article>
  );
}
