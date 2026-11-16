'use client';
import { useMemo, useState } from 'react';
import { Check, CheckCheck, Clock, Users } from 'lucide-react';
import { APPROVAL_ACTION_LABELS, ROLE_LABELS, canDecideApproval, chainView, fmtSla, isClientRole, type Approval, type ApprovalStep, type Delegation, type TeamMember } from '@jscore/contracts';
import { myTurn } from '@jscore/core/approvals/engine';
import { APPROVAL_STATUS, Async, Empty, PageHeader, Tabs, fmtDate, money, todayFor, useData } from '@/components/ui';
import { useSession } from '@/components/session';

type Tab = 'mine' | 'pending' | 'done';
const nowFor = (mode: 'demo' | 'supabase') => (mode === 'demo' ? `${todayFor(mode)}T10:00:00Z` : new Date().toISOString());

/** Onay Merkezi (0018): zincir adımları (kim sırada, SLA), "Benim sıram" süzgeci, toplu onay; adımsız (eski) onaylar required_role kuralıyla. */
export default function Approvals() {
  const { me, repo, bump, mode } = useSession();
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [approvals, steps, team, delegations] = await Promise.all([r.listApprovals(), safe(r.list('approval_steps')), safe(r.team()), safe(r.list('delegations'))]);
    return { approvals, steps: steps as ApprovalStep[], team: team as TeamMember[], delegations: delegations as Delegation[] };
  });
  const [tab, setTab] = useState<Tab>('mine');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const now = nowFor(mode);
  const turn = useMemo(() => (me && q.data ? myTurn(me, q.data.approvals, q.data.steps, { team: q.data.team, delegations: q.data.delegations, now }) : new Set<string>()), [me, q.data, now]);
  const decide = async (id: string, d: 'approved' | 'rejected') => {
    if (!repo) return;
    setBusy(id); setErr(null);
    try { await repo.decideApproval(id, d, note || undefined); setNote(''); bump(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(null); }
  };
  const bulk = async () => {
    if (!repo || !picked.size) return;
    setBusy('bulk'); setErr(null);
    let ok = 0; const fails: string[] = [];
    for (const id of picked) { try { await repo.decideApproval(id, 'approved', note || undefined); ok++; } catch (e) { fails.push(e instanceof Error ? e.message : id); } }
    setBusy(null); setPicked(new Set()); setNote('');
    if (fails.length) setErr(`${ok} onaylandı · ${fails.length} başarısız: ${fails[0]}`);
    bump();
  };
  return (
    <>
      <PageHeader title="Onay Merkezi" sub="İçerik, bütçe, kapsam, müşteri kararı, yetki, ajan planı ve teslim onayları — zincir adımları ve SLA ile" />
      <Tabs<Tab> tabs={[['mine', `Benim sıram${turn.size ? ` (${turn.size})` : ''}`], ['pending', 'Bekleyen'], ['done', 'Karara bağlanan']]} value={tab} onChange={(t) => { setTab(t); setPicked(new Set()); }} />
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      <Async q={q}>{({ approvals, steps, team, delegations }) => {
        const rows = approvals.filter((a) => (tab === 'done' ? a.status !== 'pending' : tab === 'pending' ? a.status === 'pending' : turn.has(a.id)));
        if (!rows.length) return <Empty>{tab === 'mine' ? 'Sırası sende olan onay yok.' : 'Bu sekmede kayıt yok.'}</Empty>;
        const client = !!me && isClientRole(me.role);
        return (
          <>
            {tab !== 'done' && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input className="input max-w-md" placeholder="Karar notu (isteğe bağlı)" aria-label="Karar notu" value={note} onChange={(e) => setNote(e.target.value)} />
                {tab === 'mine' && !client && <button className="btn btn-sm" disabled={busy !== null} onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((a) => a.id)))}>{picked.size === rows.length ? 'Seçimi kaldır' : 'Tümünü seç'}</button>}
                {picked.size > 0 && <button className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => void bulk()}><CheckCheck size={14} aria-hidden /> {picked.size} onayı toplu onayla</button>}
              </div>
            )}
            <ul className="grid gap-3">
              {rows.map((a) => {
                const mine = steps.filter((s) => s.approval_id === a.id);
                const view = mine.length ? chainView(mine, now) : null;
                const can = !!me && a.status === 'pending' && (view ? turn.has(a.id) : canDecideApproval(me.role, a.required_role));
                const [label, cls] = APPROVAL_STATUS[a.status];
                const requester = team.find((t) => t.id === a.requested_by)?.name;
                return (
                  <li key={a.id} className="card grid gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {tab === 'mine' && can && <input type="checkbox" aria-label={`${a.title} seç`} checked={picked.has(a.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })} />}
                          <div className="font-semibold">{a.title}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="chip chip-brand">{APPROVAL_ACTION_LABELS[a.action_type] ?? a.action_type}</span>
                          <span className={`chip ${cls}`}>{label}</span>
                          {!view && <span className="chip">Onaylayan: {ROLE_LABELS[a.required_role]}</span>}
                          {requester && <span className="chip">Talep: {requester}</span>}
                          <span className="chip">Son: {fmtDate(a.due_at)}</span>
                          {a.subject.amount_minor ? <span className="chip">{money(a.subject.amount_minor)}</span> : null}
                          {a.subject.agent && <span className="chip chip-brand">{a.subject.agent.toUpperCase()}{a.subject.payload ? ` · ${a.subject.payload.tasks.length} görev` : ''}</span>}
                          {a.subject.executed && <span className="chip chip-ok">Uygulandı · {a.subject.executed.task_ids.length} görev</span>}
                          {a.subject.effect && <span className="chip chip-ok">Uygulandı</span>}
                          {view?.current && view.hoursLeft !== null && <span className={`chip ${view.overdue ? 'chip-bad' : view.hoursLeft < 8 ? 'chip-warn' : ''}`}><Clock size={12} aria-hidden className="mr-1 inline" />{fmtSla(view.hoursLeft)}</span>}
                        </div>
                        {a.decision_note && <p className="mt-2 text-xs text-muted">Not: {a.decision_note}</p>}
                      </div>
                      {a.status === 'pending' && (
                        <div className="flex gap-2">
                          <button className="btn btn-primary btn-sm" disabled={!can || busy !== null} title={can ? '' : 'Sıra sende değil'} onClick={() => void decide(a.id, 'approved')}><Check size={14} aria-hidden /> {a.action_type === 'agent' ? 'Onayla ve uygula' : 'Onayla'}</button>
                          <button className="btn btn-sm" disabled={!can || busy !== null} onClick={() => void decide(a.id, 'rejected')}>Reddet</button>
                        </div>
                      )}
                    </div>
                    {view && <Stepper view={view} team={team} delegations={delegations} now={now} />}
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

/** Zincir adımları: ✓ bitti · ● sırada (kim, SLA) · ○ bekliyor · ✕ ret / atlandı. */
function Stepper({ view, team, delegations, now }: { view: ReturnType<typeof chainView>; team: TeamMember[]; delegations: Delegation[]; now: string }) {
  const name = (id: string) => team.find((t) => t.id === id)?.name ?? id;
  const who = (s: ApprovalStep) => {
    const parts: string[] = [];
    if (s.approvers.length) parts.push(s.approvers.map(name).join(s.mode === 'all' ? ' + ' : ' / '));
    else if (s.approver_role) parts.push(ROLE_LABELS[s.approver_role]);
    for (const e of s.escalated_to) parts.push(`↑ ${e.startsWith('role:') ? ROLE_LABELS[e.slice(5) as keyof typeof ROLE_LABELS] ?? e : name(e)}`);
    const dels = delegations.filter((d) => d.status === 'active' && d.starts_at <= now && d.ends_at > now && (d.caps.includes('*') || d.caps.includes('approvals.decide')) && (s.approvers.includes(d.from_employee_id) || team.find((t) => t.id === d.from_employee_id)?.app_role === s.approver_role));
    for (const d of dels) parts.push(`(vekil: ${name(d.to_employee_id)})`);
    return parts.join(' ');
  };
  return (
    <ol className="ap-steps" aria-label={`Onay zinciri: ${view.done}/${view.total} adım tamamlandı`}>
      {view.steps.map((s) => (
        <li key={s.id} data-status={s.status} aria-current={view.current?.id === s.id ? 'step' : undefined}>
          <span className="ap-step-dot" aria-hidden>{s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✕' : s.status === 'skipped' ? '–' : s.step_index + 1}</span>
          <span className="ap-step-body">
            <strong>{who(s)}</strong>
            <small>
              {s.status === 'approved' && s.decided_at ? `${name(s.decided_by ?? '')} · ${fmtDate(s.decided_at)}` : s.status === 'rejected' ? `Reddetti: ${name(s.decided_by ?? '')}` : s.status === 'skipped' ? 'Atlandı' : view.current?.id === s.id ? `Sırada · son ${s.due_at ? fmtDate(s.due_at) : '—'}${s.mode === 'all' ? ` · ${s.decisions.filter((d) => d.answer === 'approved').length}/${s.approvers.length} onay` : ''}` : 'Bekliyor'}
              {s.note ? ` · “${s.note}”` : ''}
            </small>
          </span>
        </li>
      ))}
      <li className="ap-steps-meta"><Users size={12} aria-hidden /> {view.done}/{view.total}</li>
    </ol>
  );
}
