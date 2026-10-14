'use client';
import { useState } from 'react';
import { ROLE_LABELS, canDecideApproval } from '@jscore/contracts';
import { APPROVAL_STATUS, Async, Empty, PageHeader, Tabs, fmtDate, money, useData } from '@/components/ui';
import { useSession } from '@/components/session';

const TYPES: Record<string, string> = { content: 'İçerik', budget: 'Bütçe', scope: 'Kapsam dışı', client_decision: 'Müşteri kararı', access: 'Yetki' };

export default function Approvals() {
  const { me, repo, bump } = useSession();
  const q = useData((r) => r.listApprovals());
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const decide = async (id: string, d: 'approved' | 'rejected') => {
    try { await repo?.decideApproval(id, d, note || undefined); setNote(''); setErr(null); bump(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); }
  };
  return (
    <>
      <PageHeader title="Onay Merkezi" sub="İçerik, bütçe, kapsam dışı iş, müşteri kararı ve yetki talepleri" />
      <Tabs<typeof tab> tabs={[['pending', 'Bekleyen'], ['done', 'Karara bağlanan']]} value={tab} onChange={setTab} />
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      <Async q={q}>{(list) => {
        const rows = list.filter((a) => (tab === 'pending') === (a.status === 'pending'));
        if (!rows.length) return <Empty>Bu sekmede kayıt yok.</Empty>;
        return (
          <>
            {tab === 'pending' && <input className="input mb-3 max-w-md" placeholder="Karar notu (isteğe bağlı)" aria-label="Karar notu" value={note} onChange={(e) => setNote(e.target.value)} />}
            <ul className="grid gap-3">
              {rows.map((a) => {
                const can = me && a.status === 'pending' && canDecideApproval(me.role, a.required_role);
                const [label, cls] = APPROVAL_STATUS[a.status];
                return (
                  <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{a.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="chip chip-brand">{TYPES[a.action_type]}</span>
                        <span className={`chip ${cls}`}>{label}</span>
                        <span className="chip">Onaylayan: {ROLE_LABELS[a.required_role]}</span>
                        <span className="chip">Son: {fmtDate(a.due_at)}</span>
                        {a.subject.amount_minor ? <span className="chip">{money(a.subject.amount_minor)}</span> : null}
                      </div>
                      {a.decision_note && <p className="mt-2 text-xs text-muted">Not: {a.decision_note}</p>}
                    </div>
                    {a.status === 'pending' && (
                      <div className="flex gap-2">
                        <button className="btn btn-primary btn-sm" disabled={!can} title={can ? '' : 'Bu onay için yetkin yok'} onClick={() => decide(a.id, 'approved')}>Onayla</button>
                        <button className="btn btn-sm" disabled={!can} onClick={() => decide(a.id, 'rejected')}>Reddet</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        );
      }}</Async>
    </>
  );
}
