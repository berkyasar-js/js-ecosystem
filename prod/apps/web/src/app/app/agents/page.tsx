'use client';
import { useMemo, useState } from 'react';
import {
  AGENT_STATUS, AGENT_STATUS_LABELS, VERSION_STATUS_LABELS, accessTier, activeVersion, lineDiff, pendingDrafts, personalAgentRunId, supervisedEmployees, versionLabel, versionText, versionsOf,
  type AgentName, type AgentVersion, type PersonalAgent, type Project, type TeamMember,
} from '@jscore/contracts';
import { agentRunBody } from '@jscore/core/agents/client';
import { approveVersion, listManagedAgents, proposeVersion, rejectVersion, rollbackTo } from '@jscore/core/personal-agents';
import { AGENCY_ROSTER, agencyRole, personaFor } from '@jscore/agents';
import { Async, Empty, ErrorBox, PageHeader, fmtTime, todayFor, useData } from '@/components/ui';
import { useCan, useSession } from '@/components/session';
import { AtelierIcon } from '@/components/atelier-icon';

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20);
const STATUS_CHIP: Record<AgentVersion['status'], string> = { draft: 'chip-warn', active: 'chip-ok', superseded: '', rejected: 'chip-bad' };
interface Data { agents: PersonalAgent[]; versions: AgentVersion[]; team: TeamMember[]; projects: Project[] }

export default function MyAgents() {
  const { repo, me, mode } = useSession();
  const canRun = useCan('agents.run');
  const q = useData<Data>(async (r) => {
    const [{ agents, versions }, team, projects] = await Promise.all([listManagedAgents(r), r.team().catch(() => []), r.listProjects().catch(() => [])]);
    return { agents, versions, team, projects };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [diffOf, setDiffOf] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ owner: '', name: '', specialty: '', base_role: '', instructions: '', can: '', cannot: '', note: '' });
  const [brief, setBrief] = useState('');
  const [projectId, setProjectId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [result, setResult] = useState<{ agentId: string; text: string; demo: boolean; version: number } | null>(null);

  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); setErr(null); try { await fn(); q.reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'İşlem başarısız'); } finally { setBusy(null); } };
  const nameOf = (team: TeamMember[], id: string | null) => (id ? team.find((m) => m.id === id)?.name ?? 'Bilinmeyen' : '—');
  const owners = useMemo(() => {
    if (!q.data || !me) return [] as TeamMember[];
    const ids = new Set(supervisedEmployees({ role: me.role, employee_id: me.employee_id }, q.data.team));
    return q.data.team.filter((m) => ids.has(m.id) && m.status !== 'left');
  }, [q.data, me]);

  if (!me) return null;
  const tier = q.data ? accessTier({ role: me.role, employee_id: me.employee_id }, q.data.team) : 'member';
  const myId = me.employee_id ?? '';

  async function create() {
    if (!repo) return;
    const owner = form.owner || myId;
    await act('create', async () => {
      const agent = await repo.save('personal_agents', { owner_employee_id: owner, base_role: form.base_role && agencyRole(form.base_role) ? form.base_role : null, status: 'active', current_version: 0, name: form.name.trim(), specialty: form.specialty.trim() });
      await proposeVersion(repo, agent.id, { instructions: form.instructions.trim(), can: lines(form.can), cannot: lines(form.cannot), change_note: 'İlk sürüm' });
      setSelected(agent.id); setCreating(false);
      setForm({ owner: '', name: '', specialty: '', base_role: '', instructions: '', can: '', cannot: '', note: '' });
    });
  }
  const demoPayload = (d: Data, a: PersonalAgent, v: AgentVersion) => ({ name: a.name, specialty: a.specialty, base_role: a.base_role, owner_employee_id: a.owner_employee_id, owner_name: nameOf(d.team, a.owner_employee_id), version: { version: v.version, instructions: v.instructions, can: v.can, cannot: v.cannot } });
  async function spend() {
    if (!repo) return {};
    const b = await agentRunBody(repo, todayFor(mode), { agent: 'pa', input: {} });
    return 'demo_spend_usd' in b ? { demo_spend_usd: b.demo_spend_usd, demo_cap_usd: b.demo_cap_usd } : {};
  }
  async function run(d: Data, a: PersonalAgent, v: AgentVersion) {
    if (!repo) return;
    await act('run', async () => {
      const res = await fetch('/api/agents/personal/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: a.id, brief, project_id: projectId || null, ...(mode === 'demo' ? { demo_agent: demoPayload(d, a, v) } : {}), ...(await spend()) }) });
      const j = await res.json() as { text?: string; mode?: string; version?: number; input?: Record<string, unknown>; error?: string };
      if (!res.ok || !j.text) throw new Error(j.error ?? 'Ajan çalıştırılamadı');
      if (mode === 'demo') await repo.logAgentRun({ agent: personalAgentRunId(a.id) as AgentName, trigger: 'personal', input: j.input ?? {}, output: { text: j.text }, model: 'demo', tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0, status: 'demo' });
      setResult({ agentId: a.id, text: j.text, demo: j.mode === 'demo', version: j.version ?? v.version }); setBrief('');
    });
  }
  async function improve(d: Data, a: PersonalAgent, v: AgentVersion) {
    if (!repo) return;
    await act('propose', async () => {
      const res = await fetch('/api/agents/personal/propose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agent_id: a.id, feedback, ...(mode === 'demo' ? { demo_agent: demoPayload(d, a, v) } : {}), ...(await spend()) }) });
      const j = await res.json() as { instructions?: string; can?: string[]; cannot?: string[]; change_note?: string; error?: string };
      if (!res.ok || !j.instructions) throw new Error(j.error ?? 'Öneri üretilemedi');
      const draft = await proposeVersion(repo, a.id, { instructions: j.instructions, can: j.can ?? v.can, cannot: j.cannot ?? v.cannot, change_note: j.change_note ?? 'Ajan önerisi' }, 'agent');
      setFeedback(''); setDiffOf(draft.id);
    });
  }

  return (
    <>
      <PageHeader title="Ajanlarım" eyebrow="ZEKÂ" sub="Kişisel ajan filon: her değişiklik sürümlenir ve onayın olmadan yürürlüğe girmez."
        actions={<button type="button" className="btn btn-primary" onClick={() => { setCreating(true); setSelected(null); setErr(null); }}><AtelierIcon id="plus" size={16} /> Yeni ajan</button>} />
      {err && <ErrorBox message={err} />}
      {q.error && /personal_agents|agent_versions|schema cache|does not exist/i.test(q.error) ? (
        <div className="card" role="status"><h2 className="font-bold">Veritabanı güncellemesi bekleniyor</h2><p className="mt-2 text-sm text-muted">Ajanlarım, <code>0022_personal_agents.sql</code> migration’ı uygulandıktan sonra açılır. Yönetici: <code>supabase db push</code>.</p></div>
      ) : <Async q={q}>{(d) => {
        const mine = d.agents.filter((a) => a.owner_employee_id === myId);
        const others = d.agents.filter((a) => a.owner_employee_id !== myId);
        const agent = d.agents.find((a) => a.id === selected) ?? null;
        const versions = agent ? versionsOf(agent.id, d.versions) : [];
        const active = agent ? activeVersion(agent.id, d.versions) : null;
        const Card = ({ a }: { a: PersonalAgent }) => { const drafts = pendingDrafts(a.id, d.versions).length; const role = a.base_role ? agencyRole(a.base_role) : undefined; return (
          <li>
            <button type="button" className={`nested flex w-full items-center gap-3 p-3 text-left ${selected === a.id ? 'agency-on' : ''}`} aria-pressed={selected === a.id} onClick={() => { setSelected(a.id); setCreating(false); setEditing(false); setDiffOf(null); setErr(null); }}>
              {role ? <img className="agency-portrait agency-portrait-sm" src={personaFor(role).image} alt="" width={36} height={36} /> : <span className="signal-icon"><AtelierIcon id="user" size={16} /></span>}
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{a.name}</strong><span className="block truncate text-xs text-muted">{a.owner_employee_id === myId ? a.specialty || 'Uzmanlık belirtilmemiş' : nameOf(d.team, a.owner_employee_id)}</span></span>
              <span className="grid justify-items-end gap-1"><span className="chip">{versionLabel(a.current_version)}</span>{drafts > 0 && <span className="chip chip-warn">{drafts} taslak</span>}{a.status !== 'active' && <span className="chip">{AGENT_STATUS_LABELS[a.status]}</span>}</span>
            </button>
          </li>
        ); };
        return (
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="grid content-start gap-4">
              <section className="card" aria-label="Benim ajanlarım">
                <h2 className="font-bold">Benim ajanlarım</h2>
                {mine.length === 0 ? <p className="mt-2 text-sm text-muted">Henüz ajanın yok. “Yeni ajan” ile ilkini kur.</p> : <ul className="mt-3 grid gap-2">{mine.map((a) => <Card key={a.id} a={a} />)}</ul>}
              </section>
              {tier !== 'member' && (
                <section className="card" aria-label="Ekibin ajanları">
                  <h2 className="font-bold">{tier === 'super_admin' ? 'Tüm ekibin ajanları' : 'Ekibimin ajanları'}</h2>
                  {others.length === 0 ? <p className="mt-2 text-sm text-muted">Denetleyebildiğin başka ajan yok.</p> : <ul className="mt-3 grid gap-2">{others.map((a) => <Card key={a.id} a={a} />)}</ul>}
                </section>
              )}
            </aside>

            <div className="min-w-0">
              {creating ? (
                <form className="card grid gap-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
                  <h2 className="font-bold">Yeni ajan</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className="label" htmlFor="na-name">Ajan adı</label><input id="na-name" className="input" required minLength={2} maxLength={80} placeholder="Örn. Meta Ads Optimizasyon Ajanı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                    <div><label className="label" htmlFor="na-owner">Kimin ajanı</label>
                      <select id="na-owner" className="input" value={form.owner || myId} onChange={(e) => setForm({ ...form, owner: e.target.value })}>{owners.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === myId ? ' (ben)' : ''}</option>)}</select></div>
                    <div><label className="label" htmlFor="na-spec">Uzmanlık</label><input id="na-spec" className="input" maxLength={200} placeholder="Örn. Reklam metni ve kreatif testi" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
                    <div><label className="label" htmlFor="na-role">Temel rol (isteğe bağlı)</label>
                      <select id="na-role" className="input" value={form.base_role} onChange={(e) => setForm({ ...form, base_role: e.target.value })}><option value="">Rol yok — yalnızca talimat</option>{AGENCY_ROSTER.map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</select></div>
                  </div>
                  <div><label className="label" htmlFor="na-ins">Çalışma talimatı</label><textarea id="na-ins" className="input" rows={5} required minLength={10} maxLength={12000} placeholder="Ajan nasıl çalışmalı, neye dikkat etmeli, çıktıyı nasıl teslim etmeli?" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className="label" htmlFor="na-can">Yapabilecekleri (satır başına bir madde)</label><textarea id="na-can" className="input" rows={3} value={form.can} onChange={(e) => setForm({ ...form, can: e.target.value })} /></div>
                    <div><label className="label" htmlFor="na-cannot">Kesinlikle yapamayacakları</label><textarea id="na-cannot" className="input" rows={3} placeholder="Örn. Bütçe onayı veremez" value={form.cannot} onChange={(e) => setForm({ ...form, cannot: e.target.value })} /></div>
                  </div>
                  <p className="text-xs text-muted">İlk sürüm taslak olarak kaydedilir; yürürlüğe almak için bir sonraki ekranda onaylaman gerekir.</p>
                  <div className="flex gap-2"><button className="btn btn-primary" disabled={busy === 'create'}>{busy === 'create' ? 'Kaydediliyor…' : 'Ajanı kur'}</button><button type="button" className="btn" onClick={() => setCreating(false)}>Vazgeç</button></div>
                </form>
              ) : !agent ? <Empty>Soldan bir ajan seç ya da yeni bir ajan kur.</Empty> : (
                <div className="grid gap-4">
                  <section className="card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0"><h2 className="text-lg font-bold">{agent.name}</h2>
                        <p className="text-sm text-muted">{nameOf(d.team, agent.owner_employee_id)} adına çalışır{agent.specialty ? ` · ${agent.specialty}` : ''}{agent.base_role && agencyRole(agent.base_role) ? ` · temel rol: ${agencyRole(agent.base_role)!.name}` : ''}</p></div>
                      <div className="flex items-center gap-2"><label className="sr-only" htmlFor="ag-status">Ajan durumu</label>
                        <select id="ag-status" className="input w-auto" value={agent.status} disabled={busy === 'status'} onChange={(e) => void act('status', async () => { await repo!.save('personal_agents', { id: agent.id, status: e.target.value as PersonalAgent['status'] }); })}>{AGENT_STATUS.map((s) => <option key={s} value={s}>{AGENT_STATUS_LABELS[s]}</option>)}</select></div>
                    </div>
                    {active ? (
                      <div className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-2">
                        <div className="md:col-span-2"><h3 className="text-sm font-bold">Yürürlükteki talimat · {versionLabel(active.version)}</h3><pre className="agency-output mt-2">{active.instructions}</pre></div>
                        <div><h3 className="text-sm font-bold">Yapabilir</h3>{active.can.length ? <ul className="mt-1 list-disc pl-5 text-sm">{active.can.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-1 text-sm text-muted">Tanımlı değil</p>}</div>
                        <div><h3 className="text-sm font-bold">Kesinlikle yapamaz</h3>{active.cannot.length ? <ul className="mt-1 list-disc pl-5 text-sm">{active.cannot.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-1 text-sm text-muted">Tanımlı değil</p>}</div>
                      </div>
                    ) : <p className="mt-4 border-t border-line pt-4 text-sm" role="status"><span className="chip chip-warn">Onaylı sürüm yok</span> Aşağıdaki taslağı onaylayana kadar ajan çalıştırılamaz.</p>}
                  </section>

                  {active && agent.status === 'active' && (
                    <section className="card grid gap-4 lg:grid-cols-2" aria-label="Çalıştır ve iyileştir">
                      <form className="grid content-start gap-3" onSubmit={(e) => { e.preventDefault(); void run(d, agent, active); }}>
                        <h3 className="text-sm font-bold">Görev ver</h3>
                        <div><label className="label" htmlFor="ag-proj">Proje (isteğe bağlı)</label><select id="ag-proj" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="">Projesiz</option>{d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                        <div><label className="label" htmlFor="ag-do">Ne yapsın?</label><textarea id="ag-do" className="input" rows={4} required minLength={3} maxLength={4000} value={brief} onChange={(e) => setBrief(e.target.value)} /></div>
                        <button className="btn btn-primary w-fit" disabled={!canRun || busy === 'run' || brief.trim().length < 3}>{busy === 'run' ? 'Çalışıyor…' : 'Çalıştır'}</button>
                        {mode === 'demo' && <p className="text-xs text-muted">Demo modunda gerçek model çağrısı yapılmaz.</p>}
                      </form>
                      <form className="grid content-start gap-3" onSubmit={(e) => { e.preventDefault(); void improve(d, agent, active); }}>
                        <h3 className="text-sm font-bold">İyileştirme öner</h3>
                        <p className="text-xs text-muted">Geri bildirimini yaz; ajan talimatını buna göre yeniden yazıp <strong>taslak</strong> olarak önerir. Sen onaylamadan yürürlüğe girmez.</p>
                        <div><label className="label" htmlFor="ag-fb">Geri bildirim</label><textarea id="ag-fb" className="input" rows={4} required minLength={5} maxLength={2000} placeholder="Örn. Çıktılar fazla uzun; en çok beş madde olsun." value={feedback} onChange={(e) => setFeedback(e.target.value)} /></div>
                        <button className="btn w-fit" disabled={!canRun || busy === 'propose' || feedback.trim().length < 5}>{busy === 'propose' ? 'Öneri hazırlanıyor…' : 'Taslak öner'}</button>
                      </form>
                      {result && result.agentId === agent.id && (
                        <div className="lg:col-span-2"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">Çıktı · talimat {versionLabel(result.version)}</h3>{result.demo && <span className="chip chip-warn">Demo çıktısı</span>}</div><pre className="agency-output mt-2">{result.text}</pre></div>
                      )}
                    </section>
                  )}

                  <section className="card" aria-label="Sürümler">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Sürümler</h3>
                      {!editing && <button type="button" className="btn btn-sm" onClick={() => { const b = active ?? versions[0]; setForm({ ...form, instructions: b?.instructions ?? '', can: (b?.can ?? []).join('\n'), cannot: (b?.cannot ?? []).join('\n'), note: '' }); setEditing(true); }}>Yeni sürüm yaz</button>}</div>
                    {editing && (
                      <form className="mt-3 grid gap-3 border-b border-line pb-4" onSubmit={(e) => { e.preventDefault(); void act('draft', async () => { const v = await proposeVersion(repo!, agent.id, { instructions: form.instructions.trim(), can: lines(form.can), cannot: lines(form.cannot), change_note: form.note.trim() }); setEditing(false); setDiffOf(v.id); }); }}>
                        <div><label className="label" htmlFor="nv-ins">Çalışma talimatı</label><textarea id="nv-ins" className="input" rows={6} required minLength={10} maxLength={12000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><label className="label" htmlFor="nv-can">Yapabilecekleri</label><textarea id="nv-can" className="input" rows={3} value={form.can} onChange={(e) => setForm({ ...form, can: e.target.value })} /></div>
                          <div><label className="label" htmlFor="nv-cannot">Kesinlikle yapamayacakları</label><textarea id="nv-cannot" className="input" rows={3} value={form.cannot} onChange={(e) => setForm({ ...form, cannot: e.target.value })} /></div>
                        </div>
                        <div><label className="label" htmlFor="nv-note">Değişiklik notu</label><input id="nv-note" className="input" maxLength={500} placeholder="Ne değişti, neden?" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
                        <div className="flex gap-2"><button className="btn btn-primary" disabled={busy === 'draft'}>Taslak olarak kaydet</button><button type="button" className="btn" onClick={() => setEditing(false)}>Vazgeç</button></div>
                      </form>
                    )}
                    {versions.length === 0 ? <p className="mt-3 text-sm text-muted">Henüz sürüm yok.</p> : (
                      <ol className="mt-3 grid gap-3">
                        {versions.map((v) => { const base = v.status === 'active' ? versions.find((x) => x.version < v.version && x.status !== 'rejected' && x.status !== 'draft') ?? null : active && active.id !== v.id ? active : null; const open = diffOf === v.id; return (
                          <li key={v.id} className="nested p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2"><strong>{versionLabel(v.version)}</strong><span className={`chip ${STATUS_CHIP[v.status]}`}>{VERSION_STATUS_LABELS[v.status]}</span><span className="chip">{v.author === 'agent' ? 'Ajan önerdi' : 'Kişi yazdı'}</span></div>
                              <span className="text-xs text-muted">{nameOf(d.team, v.created_by)} · {fmtTime(v.created_at)}{v.decided_at ? ` · karar: ${nameOf(d.team, v.decided_by)}` : ''}</span>
                            </div>
                            {v.change_note && <p className="mt-2 text-sm">{v.change_note}</p>}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setDiffOf(open ? null : v.id)}>{open ? 'Karşılaştırmayı gizle' : base ? `${versionLabel(base.version)} ile karşılaştır` : 'İçeriği göster'}</button>
                              {v.status === 'draft' && <><button type="button" className="btn btn-sm btn-primary" disabled={busy === v.id} onClick={() => void act(v.id, async () => { await approveVersion(repo!, v.id); })}>Onayla ve yürürlüğe al</button>
                                <button type="button" className="btn btn-sm" disabled={busy === v.id} onClick={() => void act(v.id, async () => { await rejectVersion(repo!, v.id); })}>Reddet</button></>}
                              {v.status === 'superseded' && <button type="button" className="btn btn-sm" disabled={busy === v.id} onClick={() => void act(v.id, async () => { await rollbackTo(repo!, v.id); })}>Bu sürüme geri dön</button>}
                            </div>
                            {open && (
                              <div className="agent-diff mt-3" role="region" aria-label={`${versionLabel(v.version)} içeriği`}>
                                {(base ? lineDiff(versionText(base), versionText(v)) : versionText(v).split('\n').map((text) => ({ kind: 'same' as const, text }))).map((l, i) => (
                                  <div key={i} className={`agent-diff-line is-${l.kind}`}><span aria-hidden="true">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span><span className="sr-only">{l.kind === 'add' ? 'Eklendi: ' : l.kind === 'del' ? 'Silindi: ' : ''}</span>{l.text || ' '}</div>
                                ))}
                              </div>
                            )}
                          </li>
                        ); })}
                      </ol>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        );
      }}</Async>}
    </>
  );
}
