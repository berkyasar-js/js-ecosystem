'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentName, Project, Task } from '@jscore/contracts';
import { agentRunBody } from '@jscore/core/agents/client';
import { Empty, ErrorBox, Loading, PageHeader, Stat, Tabs, fmtTime, todayFor } from '@/components/ui';
import { useCan, useSession } from '@/components/session';
import {
  AGENCY_ROSTER, DIVISIONS, PERSONAS, agencyActivity, divisionOf, TEAM_MAX, TEAM_MIN, personaFor, personaForRun, searchRoster, toAgencyRun,
  type AgencyRole, type TeamPick, type AgencyRunView, type SeatActivity,
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
  const [handoff, setHandoff] = useState(false);
  const [personaFilter, setPersonaFilter] = useState('');
  const [personaPick, setPersonaPick] = useState('');

  // Otomatik ekip: açıklamadan önerilen roller (çalıştırma ayrı ve onaylıdır).
  const [teamDesc, setTeamDesc] = useState('');
  const [teamProject, setTeamProject] = useState('');
  const [teamSize, setTeamSize] = useState(5);
  const [team, setTeam] = useState<Array<TeamPick & { on: boolean; state: 'idle' | 'working' | 'done' | 'error'; error?: string }> | null>(null);
  const [teamNote, setTeamNote] = useState<string | null>(null);
  const [teamMethod, setTeamMethod] = useState<'model' | 'rules' | null>(null);
  const [teamErr, setTeamErr] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState<'' | 'suggest' | 'run'>('');

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
  // AI Çalışma Alanı'ndan devredilen fikir: `?brief=` görev metnini doldurur (rolü kullanıcı seçer).
  useEffect(() => { const b = new URLSearchParams(window.location.search).get('brief'); if (b) { setBrief(b.slice(0, 4000)); setHandoff(true); } }, []);
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
    if (team?.length) return new Set(team.map((t) => t.slug)); // kurulan ekip ofiste öne çıkar
    const scoped = scope ? filtered.filter((r) => activity.has(r.slug)) : filtered;
    return scoped.length === AGENCY_ROSTER.length ? null : new Set(scoped.map((r) => r.slug));
  }, [filtered, scope, activity, team]);
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

  /** Rolü çalıştırır. `o` verilirse (otomatik ekip) formdaki değerler yerine o kullanılır ve hata çağırana fırlatılır. */
  async function run(r: AgencyRole, o?: { project_id: string | null; brief: string }) {
    if (!repo) return;
    const pid = o ? o.project_id : projectId || null;
    const tid = o ? null : taskId || null;
    if (!o) { setRunErr(null); setShown(null); }
    setWorking((w) => [...w, r.slug]);
    try {
      const body = await agentRunBody(repo, todayFor(mode), { agent: r.slug, input: {} });
      const extra = 'demo_spend_usd' in body ? { demo_spend_usd: body.demo_spend_usd, demo_cap_usd: body.demo_cap_usd } : {};
      const res = await fetch('/api/agency/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: r.slug, persona: o ? null : personaPick || null, project_id: pid, task_id: tid, brief: o ? o.brief : brief, ...extra }) });
      const j = await res.json() as { run?: RawRun & { trigger: string; model: string; tokens_in: number; tokens_out: number; latency_ms: number }; error?: string };
      if (!res.ok || !j.run) throw new Error(j.error ?? 'Rol çalıştırılamadı');
      // Demo'da sunucu durumsuz: satırı tarayıcıdaki depoya biz yazarız.
      if (mode === 'demo') await repo.logAgentRun({ ...j.run, agent: j.run.agent as AgentName, cost_usd: Number(j.run.cost_usd ?? 0), status: 'demo' });
      await repo.audit('agency.run', `agency/${r.slug}`, { project_id: pid, task_id: tid }).catch(() => {});
      const view = toAgencyRun({ ...j.run, id: `local-${Date.now()}`, created_at: new Date().toISOString() });
      if (!o) { setShown(view); setBrief(''); }
      await loadRuns();
    } catch (e) { if (o) throw e; setRunErr(e instanceof Error ? e.message : 'Rol çalıştırılamadı'); }
    finally { setWorking((w) => { const i = w.indexOf(r.slug); return i < 0 ? w : [...w.slice(0, i), ...w.slice(i + 1)]; }); }
  }

  async function suggestTeam() {
    if (!repo) return;
    setTeamErr(null); setTeamBusy('suggest');
    try {
      const body = await agentRunBody(repo, todayFor(mode), { agent: 'team-builder', input: {} });
      const extra = 'demo_spend_usd' in body ? { demo_spend_usd: body.demo_spend_usd, demo_cap_usd: body.demo_cap_usd } : {};
      const res = await fetch('/api/agency/team', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: teamDesc, project_id: teamProject || null, size: teamSize, ...extra }) });
      const j = await res.json() as { team?: TeamPick[]; method?: 'model' | 'rules'; note?: string; error?: string };
      if (!res.ok || !j.team) throw new Error(j.error ?? 'Ekip önerilemedi');
      setTeam(j.team.filter((t) => roles.has(t.slug)).map((t) => ({ ...t, on: true, state: 'idle' as const })));
      setTeamMethod(j.method ?? null); setTeamNote(j.note ?? null); setSelected(null);
    } catch (e) { setTeamErr(e instanceof Error ? e.message : 'Ekip önerilemedi'); }
    finally { setTeamBusy(''); }
  }
  /** Seçili rolleri sırayla çalıştırır; biri hata verirse diğerleri sürer. */
  async function runTeam() {
    if (!team) return;
    setTeamErr(null); setTeamBusy('run');
    const patch = (slug: string, v: Partial<NonNullable<typeof team>[number]>) => setTeam((t) => t && t.map((x) => (x.slug === slug ? { ...x, ...v } : x)));
    for (const t of team.filter((x) => x.on && x.state !== 'done')) {
      const r = roles.get(t.slug);
      if (!r) continue;
      patch(t.slug, { state: 'working', error: undefined });
      try { await run(r, { project_id: teamProject || null, brief: `${t.task}\n\nProje açıklaması:\n${teamDesc}`.slice(0, 4000) }); patch(t.slug, { state: 'done' }); }
      catch (e) { patch(t.slug, { state: 'error', error: e instanceof Error ? e.message : 'Çalıştırılamadı' }); }
    }
    setTeamBusy('');
  }
  const clearTeam = () => { setTeam(null); setTeamNote(null); setTeamMethod(null); setTeamErr(null); };
  const teamOn = team?.filter((t) => t.on && t.state !== 'done').length ?? 0;
  const pickTeamProject = (id: string) => {
    setTeamProject(id);
    const text = projects.find((x) => x.id === id)?.summary;
    if (text && !teamDesc.trim()) setTeamDesc(text.slice(0, 4000));
  };

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

      <section className="card mb-4" aria-labelledby="team-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="team-h" className="text-sm font-bold">Ekibi otomatik kur</h2>
          <p className="text-xs text-muted">Projeyi anlat; 283 rol içinden ekip ve her role bir ilk görev önerilir. Onaylamadan hiçbir rol çalışmaz.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div><label className="label" htmlFor="team-desc">Proje açıklaması</label>
            <textarea id="team-desc" className="input min-h-24" maxLength={4000} placeholder="Örn. Yeni kahve markası için 6 haftalık lansman: Instagram ve TikTok içerikleri, reklam kreatifleri, açılış sayfası ve haftalık raporlama." value={teamDesc} onChange={(e) => setTeamDesc(e.target.value)} />
            <p className="mt-1 text-xs text-muted">En az 20 karakter. Hedef, kanal ve teslimleri yazdıkça öneri isabetli olur.</p></div>
          <div className="flex flex-col gap-3">
            <div><label className="label" htmlFor="team-project">Proje (isteğe bağlı)</label>
              <select id="team-project" className="input" value={teamProject} onChange={(e) => pickTeamProject(e.target.value)}>
                <option value="">Projesiz</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div><label className="label" htmlFor="team-size">Ekip büyüklüğü</label>
              <select id="team-size" className="input" value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))}>
                {Array.from({ length: TEAM_MAX - TEAM_MIN + 1 }, (_, i) => TEAM_MIN + i).map((n) => <option key={n} value={n}>{n} rol</option>)}
              </select></div>
            <button type="button" className="btn btn-primary" disabled={!canRun || teamBusy !== '' || teamDesc.trim().length < 20} onClick={() => void suggestTeam()}>{teamBusy === 'suggest' ? 'Ekip seçiliyor…' : team ? 'Yeniden öner' : 'Ekip öner'}</button>
          </div>
        </div>
        {!canRun && <p className="mt-2 text-xs text-muted">Ekip kurmak için ajan çalıştırma yetkisi gerekir.</p>}
        {teamErr && <div className="mt-3"><ErrorBox message={teamErr} /></div>}
        {team && (
          <div className="mt-4 border-t border-line pt-4" aria-live="polite">
            <p className="mb-2 text-sm"><strong>{team.length} rol önerildi</strong> <span className="text-muted">· {teamMethod === 'model' ? 'Model seçti' : 'Kurallı eşleme'} · ofiste öne çıkarıldı</span></p>
            {teamNote && <p className="mb-3 text-xs text-muted">{teamNote}</p>}
            {team.length === 0 ? <Empty>Uygun rol bulunamadı. Açıklamayı biraz daha ayrıntılandırıp yeniden dene.</Empty> : (
              <ul className="grid gap-2">
                {team.map((t) => { const r = roles.get(t.slug)!; const d = divisionOf(r.division); return (
                  <li key={t.slug} className="flex flex-wrap items-start gap-3 rounded-[10px] border border-line p-3">
                    <input id={`team-${t.slug}`} type="checkbox" className="mt-1" checked={t.on} disabled={teamBusy === 'run' || t.state === 'done'} onChange={(e) => setTeam((x) => x && x.map((y) => (y.slug === t.slug ? { ...y, on: e.target.checked } : y)))} />
                    <img src={personaFor(r).image} alt="" width={40} height={40} className="rounded-full" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`team-${t.slug}`} className="text-sm font-semibold">{r.name}</label> <span className="text-xs text-muted">· {d?.label ?? r.division}</span>
                      {t.reason && <p className="text-xs text-muted">{t.reason}</p>}
                      <label className="sr-only" htmlFor={`team-task-${t.slug}`}>{r.name} için görev</label>
                      <textarea id={`team-task-${t.slug}`} className="input mt-2 min-h-14 text-sm" maxLength={600} value={t.task} disabled={teamBusy === 'run' || t.state === 'done'} onChange={(e) => setTeam((x) => x && x.map((y) => (y.slug === t.slug ? { ...y, task: e.target.value } : y)))} />
                      {t.error && <p className="mt-1 text-xs" style={{ color: 'var(--bad, #c0263d)' }} role="alert">{t.error}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {t.state !== 'idle' && <span className={`chip ${t.state === 'done' ? 'chip-ok' : t.state === 'error' ? 'chip-bad' : 'chip-brand'}`}>{t.state === 'done' ? 'Tamamlandı' : t.state === 'error' ? 'Hata' : 'Çalışıyor'}</span>}
                      <button type="button" className="btn btn-ghost text-xs" onClick={() => select(t.slug)}>{t.state === 'done' ? 'Çıktıyı gör' : 'Rolü aç'}</button>
                    </div>
                  </li>
                ); })}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" disabled={!canRun || teamBusy !== '' || teamOn === 0} onClick={() => void runTeam()}>{teamBusy === 'run' ? 'Ekip çalışıyor…' : `Seçili ${teamOn} rolü çalıştır`}</button>
              <button type="button" className="btn btn-ghost" disabled={teamBusy !== ''} onClick={clearTeam}>Ekibi temizle</button>
              <p className="text-xs text-muted">Her rol ayrı bir model çağrısıdır ve bütçeden düşer; roller sırayla çalışır.</p>
            </div>
          </div>
        )}
      </section>

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

      {handoff && <p className="mb-3 rounded-[10px] border border-line bg-nested p-3 text-sm" role="status">AI Çalışma Alanı’ndan bir görev metni getirildi. Bir rol seç; metin “Ne yapsın?” alanında hazır. <button type="button" className="underline" onClick={() => { setHandoff(false); setBrief(''); }}>Vazgeç</button></p>}
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
