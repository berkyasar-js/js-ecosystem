'use client';
import { useState } from 'react';
import { BID_ROLES, type Task, type TaskBid } from '@jscore/contracts';
import { requestBids } from '@/lib/bids';
import { Empty, useData } from '../ui';
import { useSession } from '../session';

const STATUS: Record<TaskBid['status'], [string, string]> = { open: ['Açık', ''], won: ['Kazandı', 'chip-ok'], lost: ['Kaybetti', ''], withdrawn: ['Çekildi', ''] };

/** Görev ihalesi: "İhaleye aç" → ikiz teklifleri → "Ata". Yüksek öncelikte atama onay kapısından geçer. */
export function TaskBids({ task, onChanged }: { task: Task; onChanged?: () => void }) {
  const { repo, me, bump } = useSession();
  const q = useData(async (r) => ({ bids: await r.listTaskBids(task.id), twins: await r.listTwins(), team: await r.team(), approvals: await r.listApprovals().catch(() => []) }), [task.id, task.assignee_id]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const can = !!me && BID_ROLES.includes(me.role);
  const high = task.priority === 'high';
  const act = async (fn: () => Promise<string>) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); q.reload(); bump(); onChanged?.(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Hata' }); } finally { setBusy(false); }
  };
  const open = () => act(async () => { const b = await requestBids(repo!, task); return `${b.length} teklif alındı.`; });
  const assign = (id: string) => act(async () => {
    const r = await repo!.assignFromBid(id);
    return r.status === 'assigned' ? 'Görev atandı.' : 'Yüksek öncelikli görev: atama onay kuyruğuna gönderildi. Onaylanınca gerçekleşir.';
  });
  return (
    <div className="mt-3 border-t border-line pt-3" aria-label={`${task.title} ihalesi`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">İhale teklifleri</h3>
        {can && task.state !== 'archive' && <button className="btn btn-sm" disabled={busy || !repo} onClick={() => void open()}>{busy ? 'Çalışıyor…' : q.data?.bids.some((b) => b.status === 'open') ? 'Yeniden ihaleye aç' : 'İhaleye aç'}</button>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${msg.ok ? 'text-[#3ddc97]' : 'text-magenta'}`}>{msg.text}</p>}
      {q.error ? <p className="mt-2 text-xs text-magenta">{q.error}</p> : !q.data ? null : q.data.bids.length === 0 ? <div className="mt-2"><Empty>Henüz teklif yok.</Empty></div> : (
        <ul className="mt-2 grid gap-2">
          {q.data.bids.map((b) => {
            const twin = q.data!.twins.find((t) => t.id === b.twin_id);
            const gate = q.data!.approvals.find((a) => a.subject.bid_id === b.id && a.status === 'pending');
            const [label, cls] = STATUS[b.status];
            return (
              <li key={b.id} className="nested flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{twin?.name.split(' ·')[0] ?? q.data!.team.find((m) => m.id === b.employee_id)?.name ?? b.twin_id}
                    <span className="chip ml-2">Güven %{b.confidence}</span> <span className="chip">~{b.eta_hours} sa</span> <span className={`chip ${cls}`}>{label}</span></div>
                  <p className="mt-1 text-xs text-muted">{b.rationale}</p>
                </div>
                {b.status === 'open' && can && (gate ? <span className="chip chip-warn">Onay bekliyor</span> :
                  <button className="btn btn-primary btn-sm" disabled={busy} title={high ? 'Yüksek öncelik: onay kapısından geçer' : undefined} onClick={() => void assign(b.id)}>{high ? 'Ata (onaya gider)' : 'Ata'}</button>)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
