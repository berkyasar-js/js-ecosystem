'use client';
import { useState } from 'react';
import { BOARD_AGENTS, type BoardAnswer, type BoardProposalOutput } from '@jscore/contracts';
import { Async, Empty, PageHeader, APPROVAL_STATUS, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { CapMeter } from '@/components/cap-meter';
import { agentRunBody } from '@/lib/agents/client';

const RISK: Record<string, string> = { low: 'chip-ok', medium: 'chip-warn', high: 'chip-bad' };
const VOTE: Record<string, string> = { yes: 'chip-ok', no: 'chip-bad', abstain: '' };

export default function Board() {
  const { repo, me, bump, mode } = useSession();
  const q = useData((r) => r.listBoardDecisions());
  const [err, setErr] = useState<string | null>(null);
  const [pack, setPack] = useState<{ summary: string; proposals: BoardProposalOutput['proposals'] } | null>(null);
  const [busy, setBusy] = useState(false);
  const canAnswer = me?.role === 'owner';

  const answer = async (id: string, a: BoardAnswer) => {
    try { await repo?.decideBoard(id, a); setErr(null); bump(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); }
  };
  const convene = async () => {
    setBusy(true); setErr(null);
    try {
      const p = await fetch('/api/board/pack');
      if (!p.ok) throw new Error('Veri paketi alınamadı');
      const res = await fetch('/api/agents/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await agentRunBody(repo, todayFor(mode), { agent: 'chair', input: await p.json() })) });
      const j = (await res.json()) as { output?: BoardProposalOutput; error?: string };
      if (!res.ok || !j.output) throw new Error(j.error ?? 'CHAIR çalışmadı');
      setPack(j.output);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Yönetim Kurulu" sub="Dokuz ajan, haftalık kurul ve kurucu kararları" actions={<button className="btn btn-accent" disabled={busy} onClick={convene}>{busy ? 'Toplanıyor…' : 'Kurulu şimdi topla'}</button>} />
      <CapMeter className="mb-4 max-w-xl" />
      <p className="mb-4 flex flex-wrap gap-2">{BOARD_AGENTS.map((a) => <span key={a} className="chip">{a.toUpperCase()}</span>)}</p>
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      {pack && (
        <section className="card mb-5">
          <h2 className="font-bold">CHAIR özeti</h2>
          <p className="mt-1 text-sm text-muted">{pack.summary}</p>
          <ul className="mt-3 grid gap-2">{pack.proposals.map((p, i) => <li key={i} className="nested text-sm"><strong>{p.action}</strong> <span className={`chip ${RISK[p.risk]}`}>{p.risk}</span> <span className="chip">Seviye {p.level}</span><div className="text-xs text-muted">{p.rationale}</div></li>)}</ul>
        </section>
      )}
      <Async q={q}>{(list) => list.length === 0 ? <Empty>Karar yok.</Empty> : (
        <ul className="grid gap-4">
          {list.map((d) => {
            const [label, cls] = APPROVAL_STATUS[d.status];
            return (
              <li key={d.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted">{d.proposal_id} · öneren {d.proposed_by.toUpperCase()}</div>
                    <h2 className="mt-1 font-bold">{d.action}</h2>
                    <p className="mt-1 text-sm text-muted">{d.rationale}</p>
                  </div>
                  <div className="flex gap-2"><span className={`chip ${RISK[d.risk]}`}>Risk: {d.risk}</span><span className="chip">Seviye {d.level}</span><span className={`chip ${cls}`}>{label}{d.founder_answer ? ` · ${d.founder_answer}` : ''}</span></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(d.votes).map(([a, v]) => <span key={a} className={`chip ${VOTE[v]}`}>{a.toUpperCase()}: {v}</span>)}</div>
                {d.status === 'pending' && (
                  <div className="mt-4 flex gap-2">
                    {(['EVET', 'HAYIR', 'ERTELE'] as const).map((a) => <button key={a} className={`btn btn-sm ${a === 'EVET' ? 'btn-primary' : ''}`} disabled={!canAnswer} title={canAnswer ? '' : 'Yalnızca kurucu karar verir'} onClick={() => answer(d.id, a)}>{a}</button>)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}</Async>
    </>
  );
}
