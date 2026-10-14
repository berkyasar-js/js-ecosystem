'use client';
import { useState } from 'react';
import { Async, Empty, PageHeader, Tabs, fmtDate, money, useData } from '@/components/ui';
import { TaskBids } from '@/components/modules/bids';

export default function Twins() {
  const q = useData(async (r) => ({ twins: await r.listTwins(), bids: await r.listTwinBids(), tasks: (await r.listTasks().catch(() => [])).filter((t) => t.state !== 'archive' && !t.assignee_id).slice(0, 20) }));
  const [tab, setTab] = useState<'twins' | 'bids' | 'tasks'>('twins');
  const [sent, setSent] = useState<Record<string, boolean>>({});
  return (
    <>
      <PageHeader title="Dijital İkizler" sub="Kişi ve rol ikizleri, kapasite ve iş ihaleleri" />
      <Tabs<typeof tab> tabs={[['twins', 'İkizler'], ['tasks', 'Görev ihaleleri'], ['bids', 'İş ihaleleri (demo)']]} value={tab} onChange={setTab} />
      <Async q={q}>{({ twins, bids, tasks }) => tab === 'tasks' ? (
        tasks.length === 0 ? <Empty>Atanmamış açık görev yok.</Empty> : (
          <ul className="grid gap-4">{tasks.map((t) => <li key={t.id} className="card"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{t.title}</h2><span className="chip">{t.priority === 'high' ? 'Yüksek öncelik' : t.priority === 'low' ? 'Düşük' : 'Normal'}</span></div><TaskBids task={t} /></li>)}</ul>
        )
      ) : tab === 'twins' ? (
        twins.length === 0 ? <Empty>İkiz yok.</Empty> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {twins.map((t) => (
              <article key={t.id} className="card">
                <div className="flex items-center justify-between"><h2 className="font-bold">{t.name}</h2><span className="chip chip-brand">{t.kind === 'person' ? 'Kişi' : 'Rol'}</span></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{((t.profile.skills as string[]) ?? []).map((s) => <span key={s} className="chip">{s}</span>)}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {t.opt_out ? <span className="chip chip-warn">Opt-out</span> : <span className="chip chip-ok">Aktif</span>}
                  {t.approved_by_owner_at ? <span className="chip">Owner onaylı</span> : <span className="chip chip-warn">Onay bekliyor</span>}
                  <span className="chip">{String(t.defaults.weekly_hours ?? '—')} sa/hafta</span>
                </div>
              </article>
            ))}
          </div>
        )
      ) : bids.length === 0 ? <Empty>Bu veri kaynağında henüz ihale akışı yok.</Empty> : (
        <div className="grid gap-4">
          {bids.map((b) => (
            <article key={b.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{b.title}</h2>
                <p className="text-sm text-muted">{b.brand} · {money(b.budget_minor)} · Teslim {fmtDate(b.due_at)}</p>
                <div className="mt-2 flex flex-wrap gap-2">{b.matches.map((m) => <span key={m.twin_id} className="chip">{twins.find((t) => t.id === m.twin_id)?.name.split(' ·')[0]} · %{m.score}</span>)}</div>
              </div>
              <button className="btn btn-sm" disabled={sent[b.id]} onClick={() => setSent((s) => ({ ...s, [b.id]: true }))}>{sent[b.id] ? 'Teklif verildi (demo)' : 'Teklif ver'}</button>
            </article>
          ))}
        </div>
      )}</Async>
    </>
  );
}
