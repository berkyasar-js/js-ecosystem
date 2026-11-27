'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentName, Project, Task } from '@jscore/contracts';
import { agentRunBody } from '@jscore/core/agents/client';
import { Empty, ErrorBox, Loading, PageHeader, Stat, Tabs, fmtTime, todayFor } from '@/components/ui';
import { useCan, useSession } from '@/components/session';
import {
  AGENCY_ROSTER, DIVISIONS, PERSONAS, agencyActivity, divisionOf, personaFor, personaForRun, searchRoster, toAgencyRun,
  type AgencyRole, type AgencyRunView, type SeatActivity,
} from '@jscore/agents';
import { officeLayout } from '@jscore/office-ui/layout';
import '@jscore/office-ui/office.css';

const Office3D = dynamic(() => import('@jscore/office-ui/office-3d').then((m) => m.Office3D), { ssr: false, loading: () => <div className="agency-stage grid place-items-center text-sm text-muted">3B ofis yükleniyor…</div> });

const STATE_CHIP: Record<SeatActivity['state'], [string, string]> = { working: ['Çalışıyor', 'chip-ok'], recent: ['Son 24 sa çalıştı', 'chip-brand'], idle: ['Boşta', ''] };
const RUN_STATUS: Record<AgencyRunView['status'], [string, string]> = { ok: ['Tamamlandı', 'chip-ok'], demo: ['Demo çıktısı', 'chip-warn'], error: ['Hata', 'chip-bad'] };
type RawRun = Parameters<typeof toAgencyRun>[0];

export default function AgencyOffice() {
  const { repo, mode, rev } = useSession();
  const canRun = useCan('agents.run');
  const layout = useMemo(() => officeLayout(AGENCY_ROSTER), []);
  const groups = useMemo(() => new Map(DIVISIONS.map((d) => [d.id, { label: d.label, color: d.color }])), []);
  const roles = useMemo(() => new Map(AGENCY_ROSTER.map((r) => [r.slug, r])), []);

  const [view, setView] = useState<'office' | 'list'>('office');
  const [no3d, setNo3d] = useState(false);
  const [q, setQ] = useState('');
  const [division, setDivision] = useState('');
  const [scope, setScope] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<AgencyRunView[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [working, setWorking] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [brief, setBrief] = useState('');
  const [runErr, setRunErr] = useState<string | null>(null);
  const [shown, setShown] = useState<AgencyRunView | null>(null);
  const [personaFilter, setPersonaFilter] = useState('');
  const [personaPick, setPersonaPick] = useState('');

  const loadRuns = useCallback(async () => {
    if (!repo) return;
    try {
      let raw: RawRun[];
      if (mode === 'demo') raw = (await repo.listAgentRuns().catch(() => [])) as RawRun[];
      else {
        const res = await fetch('/api/agency/runs', { cache: 'no-store' });
        const j = await res.json() as { runs?: AgencyRunView[]; error?: string };
        if (!res.ok) throw new Error(j.error ?? 'Etkinlik okunamadı');
        setRuns(j.runs ?? []); setLoadErr(null); setNow(Date.now());
        return;
      }
      setRuns(raw.map(toAgencyRun).filter((r): r is AgencyRunView => !!r)); setLoadErr(null); setNow(Date.now());
    } catch (e) { setLoadErr(e instanceof Error ? e.message : 'Etkinlik okunamadı'); setRuns((r) => r ?? []); }
  }, [repo, mode]);

  useEffect(() => { if (repo) repo.listProjects().then(setProjects, () => setProjects([])); }, [repo, rev]);
  useEffect(() => { void loadRuns(); }, [loadRuns, rev]);
  // Başkalarının çalıştırdığı roller de ofiste görünsün: sekme görünürken 20 sn'de bir yenile.
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void loadRuns(); }, 20_000);
    return () => window.clearInterval(t);
  }, [loadRuns]);
  useEffect(() => {
    setTaskId('');
    if (!repo || !projectId) { setTasks([]); return; }
    let alive = true;
    repo.listTasks({ project_id: projectId }).then((t) => { if (alive) setTasks(t.filter((x) => x.state !== 'archive')); }, () => { if (alive) setTasks([]); });
    return () => { alive = false; };
  }, [repo, projectId]);

  const activity = useMemo(() => agencyActivity(runs ?? [], now, working, scope || null), [runs, now, working, scope]);
  const filtered = useMemo(() => searchRoster(q, division || null).filter((r) => !personaFilter || personaFor(r).id === personaFilter), [q, division, personaFilter]);
  const matches = useMemo(() => {
    const scoped = scope ? filtered.filter((r) => activity.has(r.slug)) : filtered;
    return scoped.length === AGENCY_ROSTER.length ? null : new Set(scoped.map((r) => r.slug));
  }, [filtered, scope, activity]);
  const listed = matches ? AGENCY_ROSTER.filter((r) => matches.has(r.slug)) : AGENCY_ROSTER;
  const role = selected ? roles.get(selected) ?? null : null;
  // Ofisteki etiketler: rolün tiplemesi (son çalıştırmada elle seçildiyse o).
  const people = useMemo(() => new Map(AGENCY_ROSTER.map((r) => {
    const chosen = r.slug === selected && personaPick ? personaPick : activity.get(r.slug)?.last?.persona;
    return [r.slug, { name: r.name, image: personaForRun(r, chosen).image }];
  })), [activity, selected, personaPick]);
  const rolePersona = role ? personaForRun(role, personaPick || activity.get(role.slug)?.last?.persona) : null;
  const feed = useMemo(() => (runs ?? []).filter((r) => !scope || r.project_id === scope).slice(0, 30), [runs, scope]);
  const projectName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? 'Proje' : 'Projesiz');
  const counts = useMemo(() => {
    let w = 0; let r = 0;
    activity.forEach((a) => { if (a.state === 'working') w += 1; else if (a.state === 'recent') r += 1; });
    return { working: w, recent: r };
  }, [activity]);

  const select = (slug: string | null) => { setSelected(slug); setPersonaPick(''); setRunErr(null); setShown(slug ? activity.get(slug)?.last ?? null : null); };

  async function run(r: AgencyRole) {
    if (!repo) return;
    setRunErr(null); setShown(null);
    setWorking((w) => [...w, r.slug]);
    try {
      const body = await agentRunBody(repo, todayFor(mode), { agent: r.slug, input: {} });
      const extra = 'demo_spend_usd' in body ? { demo_spend_usd: body.demo_spend_usd, demo_cap_usd: body.demo_cap_usd } : {};
      const res = await fetch('/api/agency/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: r.slug, persona: personaPick || null, project_id: projectId || null, task_id: taskId || null, brief, ...extra }) });
      const j = await res.json() as { run?: RawRun & { trigger: string; model: string; tokens_in: number; tokens_out: number; latency_ms: number }; error?: string };
      if (!res.ok || !j.run) throw new Error(j.error ?? 'Rol çalıştırılamadı');
      // Demo'da sunucu durumsuz: satırı tarayıcıdaki depoya biz yazarız.
      if (mode === 'demo') await repo.logAgentRun({ ...j.run, agent: j.run.agent as AgentName, cost_usd: Number(j.run.cost_usd ?? 0), status: 'demo' });
      await repo.audit('agency.run', `agency/${r.slug}`, { project_id: projectId || null, task_id: taskId || null }).catch(() => {});
      const view = toAgencyRun({ ...j.run, id: `local-${Date.now()}`, created_at: new Date().toISOString() });
      setShown(view); setBrief('');
      await loadRuns();
    } catch (e) { setRunErr(e instanceof Error ? e.message : 'Rol çalıştırılamadı'); }
    finally { setWorking((w) => { const i = w.indexOf(r.slug); return i < 0 ? w : [...w.slice(0, i), ...w.slice(i + 1)]; }); }
  }

  const effectiveView = no3d ? 'list' : view;
  return (
    <>
      <PageHeader title="Ajans Ofisi" eyebrow="ZEKÂ" sub="283 uzman AI rolü tek ofiste: bir rolü projeye görevlendir, çalışırken ofiste izle." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Rol" value={AGENCY_ROSTER.length} hint={`${DIVISIONS.length} bölüm`} />
        <Stat label="Şu an çalışan" value={counts.working} tone={counts.working ? 'ok' : undefined} />
        <Stat label="Son 24 saatte çalışan" value={counts.recent} />
        <Stat label="Kayıtlı çalıştırma" value={feed.length} hint={scope ? projectName(scope) : 'Tüm projeler'} />
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1"><label className="label" htmlFor="ag-q">Rol ara</label><input id="ag-q" className="input" type="search" placeholder="Örn. reklam, güvenlik, SEO" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><label className="label" htmlFor="ag-div">Bölüm</label>
          <select id="ag-div" className="input w-auto" value={division} onChange={(e) => setDivision(e.target.value)}>
            <option value="">Tüm bölümler</option>
            {DIVISIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select></div>
        <div><label className="label" htmlFor="ag-scope">Proje</label>
          <select id="ag-scope" className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Tüm projeler</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <p className="w-full text-xs text-muted" aria-live="polite">{listed.length} rol gösteriliyor{scope ? ' · yalnızca bu projede çalışmış roller' : ''}</p>
      </div>

      <section className="mb-4" aria-label="Ajan tiplemeleri">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">Tiplemeler</h2>
          <p className="text-xs text-muted">12 hazır karakter; her rol biriyle temsil edilir. Portreler yapay zekâ ile üretilmiş kurgusal kişilerdir.</p>
        </div>
        <ul className="agency-personas">
          {PERSONAS.map((p) => { const on = personaFilter === p.id; return (
            <li key={p.id}>
              <button type="button" className={`agency-persona ${on ? 'agency-on' : ''}`} aria-pressed={on} onClick={() => setPersonaFilter(on ? '' : p.id)} title={p.blurb}>
                <img src={p.image} alt="" width={56} height={56} loading="lazy" />
                <span><strong>{p.name}</strong><span>{p.title}</span></span>
              </button>
            </li>
          ); })}
        </ul>
      </section>

      {!no3d && <Tabs<'office' | 'list'> tabs={[['office', '3B Ofis'], ['list', 'Liste']]} value={view} onChange={setView} />}
      {no3d && <p className="mb-3 text-sm text-muted">Bu tarayıcıda 3B görünüm açılamadı; roller liste olarak gösteriliyor.</p>}
      {loadErr && <ErrorBox message={loadErr} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {effectiveView === 'office' ? (
            <>
              <Office3D layout={layout} people={people} groups={groups} activity={activity} matches={matches} selected={selected} onSelect={select} onUnavailable={() => setNo3d(true)} />
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span><i className="agency-dot" style={{ background: 'var(--lime)' }} /> Çalışıyor</span>
                <span><i className="agency-dot" style={{ background: 'var(--cyan)' }} /> Son 24 saatte çalıştı</span>
                <span><i className="agency-dot" style={{ background: 'var(--line)' }} /> Boşta</span>
                <span>Sürükle: döndür · Tekerlek: yakınlaş · Masaya tıkla: rolü seç</span>
              </p>
            </>
          ) : listed.length === 0 ? <Empty>Bu süzgece uyan rol yok.</Empty> : (
            <ul className="grid max-h-[640px] gap-2 overflow-auto pr-1 md:grid-cols-2">
              {listed.map((r) => { const a = activity.get(r.slug); const [label, cls] = STATE_CHIP[a?.state ?? 'idle']; return (
                <li key={r.slug}>
                  <button type="button" className={`nested w-full rounded-2xl p-3 text-left ${selected === r.slug ? 'agency-on' : ''}`} onClick={() => select(r.slug)} aria-pressed={selected === r.slug}>
                    <span className="flex items-center justify-between gap-2"><strong className="text-sm">{r.emoji} {r.name}</strong><span className={`chip ${cls}`}>{label}</span></span>
                    <span className="mt-1 block text-xs text-muted">{divisionOf(r.division).label}</span>
                  </button>
                </li>
              ); })}
            </ul>
          )}
        </div>

        <aside className="card self-start" aria-live="polite">
          {!role ? (
            <>
              <h2 className="font-bold">Bir rol seç</h2>
              <p className="mt-2 text-sm text-muted">Ofiste bir masaya ya da listede bir role tıkla. Seçtiğin rolü bir projeye görevlendirip çalıştırabilirsin; çalışırken masası ofiste yanar.</p>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {rolePersona && <img className="agency-portrait" src={rolePersona.image} alt="" width={64} height={64} />}
                  <div className="min-w-0">
                    <h2 className="font-bold">{role.emoji} {role.name}</h2>
                    {rolePersona && <p className="text-xs text-muted">{rolePersona.name} · {rolePersona.title}</p>}
                  </div>
                </div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => select(null)}>Kapat</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="chip" style={{ borderColor: divisionOf(role.division).color }}>{divisionOf(role.division).label}</span>
                <span className={`chip ${STATE_CHIP[activity.get(role.slug)?.state ?? 'idle'][1]}`}>{STATE_CHIP[activity.get(role.slug)?.state ?? 'idle'][0]}</span>
                {(activity.get(role.slug)?.count ?? 0) > 0 && <span className="chip">{activity.get(role.slug)!.count} çalıştırma</span>}
              </div>
              <p className="mt-3 text-sm" lang="en">{role.description}</p>
              {role.vibe && <p className="mt-2 text-xs text-muted" lang="en">“{role.vibe}”</p>}

              <form className="mt-4 grid gap-3 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); void run(role); }}>
                <h3 className="text-sm font-bold">Görevlendir</h3>
                <div><label className="label" htmlFor="ag-persona">Tipleme</label>
                  <select id="ag-persona" className="input" value={personaPick} onChange={(e) => setPersonaPick(e.target.value)}>
                    <option value="">Otomatik — {personaFor(role).name} · {personaFor(role).title}</option>
                    {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.title}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="ag-project">Proje</label>
                  <select id="ag-project" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">Projesiz</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
                {tasks.length > 0 && <div><label className="label" htmlFor="ag-task">Görev (isteğe bağlı)</label>
                  <select id="ag-task" className="input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    <option value="">Görev seçme</option>
                    {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select></div>}
                <div><label className="label" htmlFor="ag-brief">Ne yapsın?</label>
                  <textarea id="ag-brief" className="input" rows={4} required minLength={3} maxLength={4000} placeholder="Örn. Lansman için üç farklı reklam metni yaz; hedef kitle 25-34 yaş." value={brief} onChange={(e) => setBrief(e.target.value)} /></div>
                {runErr && <ErrorBox message={runErr} />}
                <button className="btn btn-primary" disabled={!canRun || working.includes(role.slug) || brief.trim().length < 3}>{working.includes(role.slug) ? 'Çalışıyor…' : 'Rolü çalıştır'}</button>
                {!canRun && <p className="text-xs text-muted">Ajan çalıştırma yetkin yok (yetki matrisi → “Ajan çalıştır”).</p>}
                {mode === 'demo' && <p className="text-xs text-muted">Demo modunda gerçek model çağrısı yapılmaz; örnek çıktı üretilir.</p>}
              </form>

              {shown && shown.slug === role.slug && (
                <section className="mt-4 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">Son çıktı</h3>
                    <span className={`chip ${RUN_STATUS[shown.status][1]}`}>{RUN_STATUS[shown.status][0]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{projectName(shown.project_id)} · {fmtTime(shown.created_at)}{shown.by ? ` · ${shown.by}` : ''}</p>
                  {shown.brief && <p className="mt-2 text-xs text-muted">Görev: {shown.brief}</p>}
                  <pre className="agency-output mt-2">{shown.text || 'Çıktı yok.'}</pre>
                </section>
              )}
            </>
          )}
        </aside>
      </div>

      <section className="card mt-4">
        <h2 className="font-bold">Etkinlik</h2>
        {runs === null ? <Loading rows={3} /> : feed.length === 0 ? <p className="mt-2 text-sm text-muted">Henüz çalıştırılan rol yok. Bir rol seçip görevlendirdiğinde burada ve ofiste görünür.</p> : (
          <ul className="mt-3 grid gap-2">
            {feed.map((r) => { const ro = roles.get(r.slug); const [label, cls] = RUN_STATUS[r.status]; return (
              <li key={r.id}>
                <button type="button" className="nested flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl p-3 text-left" onClick={() => { setSelected(r.slug); setShown(r); setRunErr(null); }}>
                  {ro && <img className="agency-portrait agency-portrait-sm" src={personaForRun(ro, r.persona).image} alt="" width={36} height={36} loading="lazy" />}
                  <span className="min-w-0 flex-1"><strong className="text-sm">{ro ? `${ro.emoji} ${ro.name}` : r.slug}{ro ? <span className="font-normal text-muted"> · {personaForRun(ro, r.persona).name}</span> : null}</strong><span className="block truncate text-xs text-muted">{projectName(r.project_id)}{r.by ? ` · ${r.by}` : ''} · {r.brief}</span></span>
                  <span className="flex items-center gap-2 text-xs text-muted"><span className={`chip ${cls}`}>{label}</span>{fmtTime(r.created_at)}</span>
                </button>
              </li>
            ); })}
          </ul>
        )}
      </section>
    </>
  );
}
