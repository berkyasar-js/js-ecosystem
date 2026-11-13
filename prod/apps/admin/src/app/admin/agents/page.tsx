'use client';
import { useEffect, useMemo, useState } from 'react';
import { AGENTS, AGENT_MODES, AGENT_MODE_LABELS, agentSpendTry, type AgentMode, type AgentPolicy, type Approval, type OrgSettings } from '@jscore/contracts';
import { DEFAULT_USD_TRY, fmtTry } from '@jscore/core/agents/cap';
import { Async, PageHeader, fmtTime, useData } from '@/components/ui';
import { CapMeter } from '@/components/cap-meter';
import { OrbitDialog } from '@/components/dialog';
import { Msg, errText } from '@/components/admin-ui';
import { useSession } from '@/components/session';
import { useAdminSettings, useApi } from '@/lib/client';

interface Prompt { id: string; agent: string; version: number; model: string; is_active: boolean; org_id?: string | null; created_at?: string }
interface Run { id: string; agent: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number | string; status: string; created_at: string; trigger?: string; latency_ms?: number; input?: unknown; output?: unknown }
interface AgentsData { prompts: Prompt[]; runs: Run[] }
const AUTO_ACTIONS: Array<[string, string]> = [['task.create', 'Görev oluştur'], ['bid.propose', 'İhale teklifi'], ['draft.create', 'Taslak üret'], ['notify', 'Bildirim gönder']];

function useAgents() {
  const { mode } = useSession();
  const demo = useData(async (r) => ({ prompts: (await r.listAgentPrompts().catch(() => [])) as Prompt[], runs: (await r.listAgentRuns().catch(() => [])) as Run[] }));
  const live = useApi<AgentsData>(mode === 'demo' ? null : '/api/admin/agents');
  return mode === 'demo' ? demo : live;
}

export default function Agents() {
  const st = useAdminSettings();
  const q = useAgents();
  const [ai, setAi] = useState<OrgSettings['ai'] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [trace, setTrace] = useState<Run | null>(null);
  useEffect(() => { if (st.settings) setAi(st.settings.ai); }, [st.settings]);
  const save = async () => { if (!ai) return; try { await st.save({ ai }); setMsg({ ok: true, text: 'Kaydedildi.' }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } };
  const usdTry = ai?.usd_try ?? DEFAULT_USD_TRY;
  return (
    <>
      <PageHeader title="Ajanlar & Maliyet" sub="Aylık tavan, varsayılan model, ajan modları ve bütçeleri, ajan onayları, prompt sürümleri ve çalıştırma izleri" />
      <Msg m={msg} />
      <div className="grid gap-5">
        <section className="card grid max-w-3xl gap-4">
          <h2 className="font-bold">Maliyet ve model</h2>
          <CapMeter />
          {ai && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="cap">Aylık maliyet tavanı (USD) · 0 = tavan yok</label><input id="cap" type="number" min={0} className="input" value={ai.monthly_cap_usd} onChange={(e) => setAi({ ...ai, monthly_cap_usd: Number(e.target.value) })} />
                  <p className="mt-1 text-xs text-muted">≈ {fmtTry(ai.monthly_cap_usd * usdTry)} — tavan aşılırsa ajan çalıştırmaları 402 ile reddedilir.</p></div>
                <div><label className="label" htmlFor="fx">Kur (₺ / USD)</label><input id="fx" type="number" min={1} step="0.01" className="input" value={ai.usd_try ?? DEFAULT_USD_TRY} onChange={(e) => setAi({ ...ai, usd_try: Number(e.target.value) || DEFAULT_USD_TRY })} /></div>
                <div><label className="label" htmlFor="mdl">Varsayılan model</label><input id="mdl" className="input" value={ai.default_model} onChange={(e) => setAi({ ...ai, default_model: e.target.value })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ai.board_enabled} onChange={(e) => setAi({ ...ai, board_enabled: e.target.checked })} /> Haftalık kurul açık</label>
              <button className="btn btn-primary w-fit" onClick={() => void save()}>Kaydet</button>
            </>
          )}
        </section>
        <Async q={q}>{({ prompts, runs }) => (
          <>
            <Policies runs={runs} usdTry={usdTry} />
            <AgentApprovals />
            <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Prompt sürümleri</h2>
              <table className="table"><thead><tr><th>Ajan</th><th>Sürüm</th><th>Model</th><th>Kapsam</th><th>Durum</th></tr></thead><tbody>
                {prompts.map((p) => <tr key={p.id}><td>{p.agent}</td><td>v{p.version}</td><td>{p.model}</td><td>{p.org_id === null ? 'Genel' : 'Organizasyon'}</td><td><span className={`chip ${p.is_active ? 'chip-ok' : ''}`}>{p.is_active ? 'Aktif' : 'Eski'}</span></td></tr>)}
              </tbody></table>
              <p className="mt-2 text-xs text-muted">Yeni sürüm: <code>npm run prompts:sql</code> ile üretilip veritabanına uygulanır (packages/prompts).</p></section>
            <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Çalıştırma günlüğü · toplam ${runs.reduce((a, r) => a + Number(r.cost_usd), 0).toFixed(4)}</h2>
              <table className="table"><thead><tr><th>Ajan</th><th>Tetik</th><th>Model</th><th>Token</th><th>Maliyet</th><th>Süre</th><th>Durum</th><th>Zaman</th><th></th></tr></thead><tbody>
                {runs.map((r) => <tr key={r.id}><td>{r.agent}</td><td className="text-muted">{r.trigger ?? '—'}</td><td>{r.model}</td><td>{r.tokens_in}/{r.tokens_out}</td><td>${Number(r.cost_usd).toFixed(4)} <span className="text-xs text-muted">≈ {fmtTry(Number(r.cost_usd) * usdTry)}</span></td><td>{r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)} sn` : '—'}</td><td><span className={`chip ${r.status === 'error' ? 'chip-bad' : ''}`}>{r.status}</span></td><td>{fmtTime(r.created_at)}</td><td><button className="btn btn-ghost btn-sm" onClick={() => setTrace(r)}>İz</button></td></tr>)}
              </tbody></table></section>
          </>
        )}</Async>
      </div>
      <OrbitDialog open={!!trace} onClose={() => setTrace(null)} title={trace ? `Çalıştırma izi · ${trace.agent}` : 'İz'} description={trace ? `${fmtTime(trace.created_at)} · ${trace.model} · ${trace.tokens_in}/${trace.tokens_out} token · $${Number(trace.cost_usd).toFixed(4)} (≈ ${fmtTry(Number(trace.cost_usd) * usdTry)}) · ${trace.status}` : undefined}>
        {trace && (
          <div className="wk-dialog-body">
            <h3 className="label">Girdi</h3><pre className="nested max-h-60 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(trace.input ?? {}, null, 2)}</pre>
            <h3 className="label">Çıktı</h3><pre className="nested max-h-72 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(trace.output ?? {}, null, 2)}</pre>
          </div>
        )}
      </OrbitDialog>
    </>
  );
}

/** Ajan modları (Sor / Planla / Uygula), aylık ₺ bütçe ve otomatik onay kuralları — `agent_policies` (Repo; owner/org_admin). */
function Policies({ runs, usdTry }: { runs: Run[]; usdTry: number }) {
  const { repo, rev, bump } = useSession();
  const q = useData((r) => r.list('agent_policies').catch(() => [] as AgentPolicy[]), [rev]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const month = new Date().toISOString().slice(0, 7);
  const byAgent = useMemo(() => new Map((q.data ?? []).map((p) => [p.agent, p])), [q.data]);
  const upsert = async (agent: string, patch: Partial<Omit<AgentPolicy, 'id' | 'org_id' | 'created_at'>>) => {
    if (!repo) return;
    setBusy(agent); setErr(null);
    const cur = byAgent.get(agent);
    try {
      if (cur) await repo.save('agent_policies', { id: cur.id, ...patch });
      else await repo.save('agent_policies', { agent, mode: 'ask', monthly_budget_try: 0, auto_approve: { actions: [] }, ...patch });
      bump();
    } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  return (
    <section className="card overflow-x-auto" id="policies">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Ajan modları ve bütçeler</h2><span className="text-xs text-muted">Sor = salt okunur (yazma önerileri onay kartına düşer) · Planla = plan üretir, onayla uygulanır · Uygula = bütçe içinde ve otomatik onay kuralı kapsamındaysa doğrudan yazar</span></div>
      {err && <p role="alert" className="mb-2 text-sm text-magenta">{err}</p>}
      <table className="table"><thead><tr><th>Ajan</th><th>Mod</th><th>Aylık bütçe (₺) · 0 = sınırsız</th><th>Bu ay</th><th>Otomatik onay (Uygula modunda)</th><th>En çok kalem</th></tr></thead><tbody>
        {AGENTS.map((agent) => {
          const p = byAgent.get(agent);
          const spent = agentSpendTry(runs, agent, month, usdTry);
          const over = (p?.monthly_budget_try ?? 0) > 0 && spent > (p?.monthly_budget_try ?? 0);
          return (
            <tr key={agent} aria-busy={busy === agent}>
              <td><strong>{agent.toUpperCase()}</strong>{agent === 'chair' && <div className="text-xs text-muted">Kurul planı aktarımı bu moda bakar</div>}</td>
              <td><select className="input w-auto py-1" aria-label={`${agent} modu`} value={p?.mode ?? 'ask'} disabled={busy === agent} onChange={(e) => void upsert(agent, { mode: e.target.value as AgentMode })}>{AGENT_MODES.map((m) => <option key={m} value={m}>{AGENT_MODE_LABELS[m]}</option>)}</select></td>
              <td><input className="input w-28 py-1" type="number" min={0} aria-label={`${agent} aylık bütçe`} defaultValue={p?.monthly_budget_try ?? 0} key={`${agent}-${p?.monthly_budget_try ?? 0}`} disabled={busy === agent} onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== (p?.monthly_budget_try ?? 0)) void upsert(agent, { monthly_budget_try: v }); }} /></td>
              <td><span className={`chip ${over ? 'chip-bad' : ''}`}>{fmtTry(spent)}</span></td>
              <td><div className="flex flex-wrap gap-1">{AUTO_ACTIONS.map(([k, l]) => { const on = p?.auto_approve.actions.includes(k) ?? false; return <button key={k} type="button" className={`chip ${on ? 'chip-ok' : ''}`} aria-pressed={on} disabled={busy === agent || (p?.mode ?? 'ask') !== 'act'} title={(p?.mode ?? 'ask') !== 'act' ? 'Yalnızca Uygula modunda' : undefined} onClick={() => void upsert(agent, { auto_approve: { ...(p?.auto_approve ?? { actions: [] }), actions: on ? (p?.auto_approve.actions ?? []).filter((x) => x !== k) : [...(p?.auto_approve.actions ?? []), k] } })}>{l}</button>; })}</div></td>
              <td><input className="input w-20 py-1" type="number" min={0} aria-label={`${agent} en çok kalem`} defaultValue={p?.auto_approve.max_items ?? 0} key={`${agent}-mx-${p?.auto_approve.max_items ?? 0}`} disabled={busy === agent} onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== (p?.auto_approve.max_items ?? 0)) void upsert(agent, { auto_approve: { ...(p?.auto_approve ?? { actions: [] }), max_items: v } }); }} /></td>
            </tr>
          );
        })}
      </tbody></table>
      <p className="mt-2 text-xs text-muted">Bütçe aşımı her modda engeller (402). Politika kaydı olmayan ajan <strong>Sor</strong> sayılır. Değişiklikler denetim kaydına yazılır (agent_policies.*).</p>
    </section>
  );
}

/** Ajan onayları (action_type='agent'): bekleyen öneriler → onayla (uygulanır) / reddet; karara bağlananlarda kim onayladı. */
function AgentApprovals() {
  const { repo, rev, bump } = useSession();
  const q = useData((r) => r.listApprovals().catch(() => [] as Approval[]), [rev]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (a: Approval, d: 'approved' | 'rejected') => {
    if (!repo) return;
    setBusy(a.id); setErr(null);
    try { await repo.decideApproval(a.id, d); bump(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  };
  const list = (q.data ?? []).filter((a) => a.action_type === 'agent');
  const pending = list.filter((a) => a.status === 'pending');
  const done = list.filter((a) => a.status !== 'pending').slice(0, 10);
  return (
    <section className="card" id="approvals">
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-bold">Ajan onayları</h2><span className={`chip ${pending.length ? 'chip-warn' : 'chip-ok'}`}>{pending.length} bekliyor</span></div>
      {err && <p role="alert" className="mb-2 text-sm text-magenta">{err}</p>}
      {pending.length === 0 ? <p className="text-sm text-muted">Bekleyen ajan önerisi yok. Kurul Sohbeti’nde “Seçili görevleri sisteme aktar” CHAIR “Uygula” modunda değilse buraya düşer.</p> : (
        <ul className="grid gap-3">
          {pending.map((a) => (
            <li key={a.id} className="nested">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><strong>{a.title}</strong><span className="chip chip-brand">{(a.subject.agent ?? 'ajan').toUpperCase()}</span><span className="chip">{fmtTime(a.created_at)}</span></div>
                  {a.subject.note && <p className="mt-1 text-xs text-muted">{a.subject.note}</p>}
                  {a.subject.payload && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">Görevler ({a.subject.payload.tasks.length}){a.subject.payload.milestones?.length ? ` · ${a.subject.payload.milestones.length} kilometre taşı` : ''}{a.subject.payload.members?.length ? ` · ${a.subject.payload.members.length} üye` : ''}</summary>
                    <ul className="mt-2 grid gap-1">{a.subject.payload.tasks.map((t, i) => <li key={i}>{t.title} <span className="chip">{t.priority}</span>{t.milestone && <span className="chip">◆ {t.milestone}</span>}</li>)}</ul></details>}
                </div>
                <div className="flex gap-2"><button className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => void decide(a, 'approved')}>Onayla ve uygula</button><button className="btn btn-sm" disabled={busy === a.id} onClick={() => void decide(a, 'rejected')}>Reddet</button></div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-3 overflow-x-auto"><table className="table text-sm"><thead><tr><th>Öneri</th><th>Karar</th><th>Kim</th><th>Zaman</th><th>Sonuç</th></tr></thead><tbody>
          {done.map((a) => <tr key={a.id}><td>{a.title}</td><td><span className={`chip ${a.status === 'approved' ? 'chip-ok' : 'chip-bad'}`}>{a.status === 'approved' ? 'Onaylandı' : 'Reddedildi'}</span></td><td className="text-muted">{a.decided_by?.slice(0, 12) ?? '—'}</td><td>{a.decided_at ? fmtTime(a.decided_at) : '—'}</td><td className="text-muted">{a.subject.executed ? `${a.subject.executed.task_ids.length} görev oluştu` : '—'}</td></tr>)}
        </tbody></table></div>
      )}
    </section>
  );
}
