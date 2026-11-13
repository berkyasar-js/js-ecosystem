'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, CheckCheck, Inbox as InboxIcon, Mail } from 'lucide-react';
import { markInboxDone, type Notification } from '@jscore/contracts';
import { Async, Empty, PageHeader, fmtDate, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { EmailInbox } from '@/components/inbox/email-inbox';
import { INBOX_KIND_LABELS, buildInbox, filterInbox, inboxCounts, type InboxFilter } from '@/lib/inbox';

const FILTERS: Array<[InboxFilter, string]> = [['all', 'Tümü'], ['approval', 'Onaylar'], ['due', 'Teslimler'], ['mention', 'Anmalar'], ['trello', 'Trello'], ['notification', 'Bildirimler']];

/** Gelen Kutusu: dikkat isteyen her şey tek kuyrukta (bildirim, bana düşen onay, anma, görevimdeki Trello değişikliği, bugün biten / geciken). */
export default function InboxPage() {
  const qs = useSearchParams();
  const tab = qs.get('tab') === 'email' ? 'email' : 'queue';
  return (
    <>
      <PageHeader title="Gelen Kutusu" sub="Dikkatini isteyen her şey tek yerde" />
      <nav className="tabs" role="tablist" aria-label="Gelen kutusu sekmeleri">
        <Link role="tab" href="/app/inbox" aria-selected={tab === 'queue'} className="tab" scroll={false}><InboxIcon size={14} aria-hidden className="mr-1 inline" />Kuyruk</Link>
        <Link role="tab" href="/app/inbox?tab=email" aria-selected={tab === 'email'} className="tab" scroll={false}><Mail size={14} aria-hidden className="mr-1 inline" />E-posta</Link>
      </nav>
      {tab === 'email' ? <EmailInbox /> : <Queue />}
    </>
  );
}

function Queue() {
  const { me, mode, repo, prefs, setPrefs, bump } = useSession();
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [tasks, approvals, notifications] = await Promise.all([safe(r.listTasks()), safe(r.listApprovals()), safe(r.list('notifications'))]);
    return { tasks, approvals, notifications: notifications as Notification[] };
  });
  const [filter, setFilter] = useState<InboxFilter>('all');
  const today = todayFor(mode);
  const items = useMemo(() => (me && q.data ? buildInbox({ me, ...q.data, today, done: prefs.inbox_done }) : []), [me, q.data, today, prefs.inbox_done]);
  const counts = inboxCounts(items);
  const shown = filterInbox(items, filter);
  const markRead = async (id: string) => { try { await repo?.save('notifications', { id, read: true }); bump(); } catch { /* yetki */ } };
  const done = async (itemId: string, notificationId?: string) => { await setPrefs({ inbox_done: markInboxDone(prefs.inbox_done, itemId) }); if (notificationId) void markRead(notificationId); };
  const doneAll = async () => { let d = prefs.inbox_done; for (const x of shown) d = markInboxDone(d, x.id); await setPrefs({ inbox_done: d }); for (const x of shown) if (x.notification_id) void markRead(x.notification_id); };
  return (
    <Async q={q}>{() => (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([f, label]) => <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label} {counts[f] > 0 && <span className="chip">{counts[f]}</span>}</button>)}
          {shown.length > 0 && <button className="btn btn-sm ml-auto" onClick={() => void doneAll()}><CheckCheck size={14} aria-hidden /> Tümünü tamamla</button>}
        </div>
        {shown.length === 0 ? <Empty>Kuyruk temiz. Seni bekleyen bir şey yok.</Empty> : (
          <ul className="home-list" aria-label="Kuyruk">
            {shown.map((x) => (
              <li key={x.id} className="home-row">
                <span className={`chip ${x.kind === 'approval' ? 'chip-warn' : x.kind === 'due' && x.urgent ? 'chip-bad' : x.kind === 'mention' ? 'chip-brand' : ''}`}>{INBOX_KIND_LABELS[x.kind]}</span>
                <Link href={x.href} className="min-w-0 flex-1 truncate" onClick={() => { if (x.notification_id) void markRead(x.notification_id); }}>
                  <span className="font-semibold">{x.title}</span><span className="ml-2 text-xs text-muted">{x.body}</span>
                </Link>
                <span className="hidden text-xs text-muted sm:inline">{fmtDate(x.at)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => void done(x.id, x.notification_id)} aria-label={`${x.title}: tamam`} title="Tamam"><Check size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Onaylar karar verilince, görevler teslim edilince kendiliğinden düşer; “Tamam” yalnızca senin kuyruğundan kaldırır.</p>
      </div>
    )}</Async>
  );
}
