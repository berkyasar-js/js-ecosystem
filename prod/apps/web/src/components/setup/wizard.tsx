'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import {
  DEFAULT_SETUP, ROLE_LABELS, SETUP_PACKS, SETUP_STEPS, SETUP_STEP_LABELS, TEAM_SHEET_COLUMNS, moduleFlagKey, packsFromFlags, packsToFlags, setupProgress, setupStateSchema,
  type Brand, type OrgSettings, type Project, type SetupState, type SetupStep, type TeamImportRow, type TeamMember,
} from '@jscore/contracts';
import { isSupabaseConfigured } from '@jscore/core/env';
import { createBrowser } from '@jscore/core/supabase/browser';
import { useSession } from '../session';
import { Loading, PageHeader, useData } from '../ui';
import { Bar, useAct } from '../mod';
import { QuickCreate } from '../quick-create';
import { parseTeamRows, resolveManager } from '@/lib/team-import';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';
const TZ = ['Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'Asia/Dubai'];
const CUR = ['TRY', 'USD', 'EUR', 'GBP'];

/** Kurulum sihirbazı (owner / org_admin): adımlar URL'de (?step=), ilerleme organizations.settings.setup içinde; her an bırakılıp devam edilebilir. */
export function SetupWizard({ embedded = false }: { embedded?: boolean }) {
  const { me, repo, features, bump } = useSession();
  const router = useRouter();
  const qs = useSearchParams();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { repo?.getSettings().then(setSettings, (e: unknown) => setErr(e instanceof Error ? e.message : 'Hata')); }, [repo]);
  useEffect(load, [load, features.setup]);
  const setup = useMemo<SetupState>(() => setupStateSchema.parse(settings?.setup ?? DEFAULT_SETUP), [settings]);
  const wanted = qs.get('step') as SetupStep | null;
  const step: SetupStep = wanted && SETUP_STEPS.includes(wanted) ? wanted : setup.step ?? SETUP_STEPS.find((s) => !setup.done.includes(s)) ?? 'summary';
  const idx = SETUP_STEPS.indexOf(step);
  const go = (s: SetupStep) => router.push(`/app/setup?step=${s}`);
  /** Ayar yaması + kurulum durumu birlikte yazılır. */
  const save = useCallback(async (patch: Partial<OrgSettings>, done?: SetupStep, extra: Partial<SetupState> = {}) => {
    if (!repo) return;
    const next: SetupState = { ...setup, ...extra, done: done && !setup.done.includes(done) ? [...setup.done, done] : setup.done, step: done ? SETUP_STEPS[Math.min(SETUP_STEPS.length - 1, SETUP_STEPS.indexOf(done) + 1)] : setup.step };
    const s = await repo.saveSettings({ ...patch, setup: next });
    setSettings(s); bump();
  }, [repo, setup, bump]);
  const advance = async (patch: Partial<OrgSettings>, extra?: Partial<SetupState>) => { await save(patch, step, extra); if (idx < SETUP_STEPS.length - 1) go(SETUP_STEPS[idx + 1]); };

  if (!me) return null;
  if (me.role !== 'owner' && me.role !== 'org_admin') return <div className="card max-w-xl text-sm text-muted">Kurulum sihirbazı yalnızca owner / org_admin içindir.</div>;
  if (err) return <div className="card text-sm text-magenta">{err}</div>;
  if (!settings) return <Loading />;
  const prog = setupProgress(setup);
  return (
    <>
      {!embedded && <PageHeader eyebrow="Çalışma alanı kurulumu" title={SETUP_STEP_LABELS[step]} sub={`${prog.done}/${prog.total} adım tamamlandı`} actions={ADMIN_URL ? <a className="btn" href={`${ADMIN_URL}/admin/setup`} target="_blank" rel="noreferrer">Panelde gör <ExternalLink size={14} aria-hidden /></a> : undefined} />}
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="card h-fit">
          <div className="mb-3"><Bar pct={prog.pct} tone="ok" /></div>
          <ol className="setup-steps">
            {SETUP_STEPS.map((s, i) => { const done = setup.done.includes(s); return (
              <li key={s}><button className="setup-step w-full text-left" aria-current={s === step ? 'step' : undefined} onClick={() => go(s)}><span className={`setup-dot ${done ? 'done' : ''}`}>{done ? <Check size={13} aria-hidden /> : i + 1}</span><span>{SETUP_STEP_LABELS[s]}</span></button></li>
            ); })}
          </ol>
          {setup.completed_at && <p className="mt-3 flex items-center gap-2 text-xs text-[#3ddc97]"><CheckCircle2 size={14} aria-hidden /> Tamamlandı · {setup.completed_at.slice(0, 10)}</p>}
        </aside>
        <section className="grid gap-4">
          {step === 'org' && <OrgStep settings={settings} onNext={advance} />}
          {step === 'team' && <TeamStep onNext={() => advance({})} />}
          {step === 'modules' && <ModulesStep settings={settings} onNext={(flags, packs) => advance({ feature_flags: flags }, { packs })} />}
          {step === 'integrations' && <IntegrationsStep onNext={() => advance({})} />}
          {step === 'first' && <FirstStep onNext={() => advance({})} />}
          {step === 'summary' && <SummaryStep setup={setup} settings={settings} onComplete={() => save({}, 'summary', { completed_at: new Date().toISOString(), step: 'summary' }).then(() => router.push('/app/overview'))} />}
          <div className="flex items-center justify-between">
            <button className="btn" disabled={idx === 0} onClick={() => go(SETUP_STEPS[idx - 1])}><ArrowLeft size={15} aria-hidden /> Geri</button>
            <div className="flex items-center gap-2"><Link href="/app/overview" className="btn btn-ghost">Sonra devam et</Link>{idx < SETUP_STEPS.length - 1 && <button className="btn btn-ghost" onClick={() => go(SETUP_STEPS[idx + 1])}>Bu adımı atla <ArrowRight size={15} aria-hidden /></button>}</div>
          </div>
        </section>
      </div>
    </>
  );
}

/* ───────── 1 · Organizasyon ───────── */
function OrgStep({ settings, onNext }: { settings: OrgSettings; onNext(p: Partial<OrgSettings>): Promise<void> }) {
  const { act, busy, Err } = useAct();
  const [g, setG] = useState(settings.general);
  const [hours, setHours] = useState(settings.structure.work_hours);
  return (
    <form className="card grid gap-4" onSubmit={(e) => { e.preventDefault(); void act(() => onNext({ general: g, structure: { ...settings.structure, work_hours: hours } })); }}>
      {Err}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="s-name">Organizasyon adı</label><input id="s-name" className="input" required minLength={2} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="s-logo">Logo URL’si (https)</label><input id="s-logo" type="url" className="input" placeholder="https://…/logo.svg" value={g.logo_url ?? ''} onChange={(e) => setG({ ...g, logo_url: e.target.value })} /></div>
        <div><label className="label" htmlFor="s-tz">Saat dilimi</label><input id="s-tz" className="input" list="tz" value={g.timezone} onChange={(e) => setG({ ...g, timezone: e.target.value })} /><datalist id="tz">{TZ.map((t) => <option key={t} value={t} />)}</datalist></div>
        <div><label className="label" htmlFor="s-cur">Para birimi</label><input id="s-cur" className="input" list="cur" value={g.currency} onChange={(e) => setG({ ...g, currency: e.target.value.toUpperCase() })} /><datalist id="cur">{CUR.map((c) => <option key={c} value={c} />)}</datalist></div>
        <div><label className="label" htmlFor="s-hours">Çalışma saatleri</label><input id="s-hours" className="input" pattern="\d{2}:\d{2}-\d{2}:\d{2}" placeholder="09:00-18:00" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
      </div>
      {g.logo_url && /^https:\/\//.test(g.logo_url) && <img src={g.logo_url} alt="Logo önizleme" className="h-10 w-auto self-start rounded bg-white/5 p-1" />}
      <button className="btn btn-primary w-fit" disabled={busy}>Kaydet ve devam <ArrowRight size={15} aria-hidden /></button>
    </form>
  );
}

/* ───────── 2 · Ekip: elle ekle + XLSX ───────── */
function TeamStep({ onNext }: { onNext(): Promise<void> }) {
  const { repo, mode } = useSession();
  const { act, busy, Err } = useAct();
  const q = useData((r) => r.team());
  const team = useMemo(() => q.data ?? [], [q.data]);
  const [rows, setRows] = useState<TeamImportRow[] | null>(null);
  const [meta, setMeta] = useState<{ ignored: string[]; unknown: string[]; skipped: number; sheet: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    setFileErr(null); setRows(null); setMeta(null); setResult(null);
    if (!f) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      const name = wb.SheetNames.find((n) => n.trim().toLocaleLowerCase('tr') === 'ekip') ?? wb.SheetNames[0];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '' });
      const r = parseTeamRows(json);
      setRows(r.rows); setMeta({ ignored: r.ignored_columns, unknown: r.unknown_columns, skipped: r.skipped, sheet: name });
    } catch (e) { setFileErr(e instanceof Error ? e.message : 'Dosya okunamadı'); }
  };
  const importRows = () => act(async () => {
    if (!rows?.length) throw new Error('İçe aktarılacak satır yok');
    const existing = [...team];
    const created: TeamMember[] = [];
    for (const r of rows) {
      if (existing.some((t) => t.name.toLocaleLowerCase('tr') === r.name.toLocaleLowerCase('tr'))) continue;
      const m = await repo!.addEmployee({ name: r.name, role_title: r.title, app_role: r.app_role ?? 'creative', status: r.status, team: r.team, hired_at: r.hired_at });
      created.push(m); existing.push(m);
    }
    let linked = 0;
    for (const r of rows) {
      const self = existing.find((t) => t.name.toLocaleLowerCase('tr') === r.name.toLocaleLowerCase('tr'));
      const mgr = resolveManager(r.manager_name, existing.filter((t) => t.id !== self?.id));
      if (self && mgr && self.manager_id !== mgr) { await repo!.updateEmployee(self.id, { manager_id: mgr }); linked++; }
    }
    await repo!.audit('setup.team_import', 'employees', { rows: rows.length, created: created.length, linked, ignored_columns: meta?.ignored ?? [] });
    setResult(`${created.length} kişi eklendi, ${rows.length - created.length} zaten vardı, ${linked} yönetici bağı kuruldu.`);
    setRows(null); q.reload();
  });
  return (
    <div className="grid gap-4">
      {Err}
      <ManualAdd team={team} onAdded={() => q.reload()} />
      <section className="card grid gap-3">
        <h2 className="flex items-center gap-2 font-bold"><FileSpreadsheet size={16} aria-hidden /> XLSX ile içe aktar (“Ekip” sayfası)</h2>
        <p className="text-sm text-muted">Beklenen sütunlar: {Object.values(TEAM_SHEET_COLUMNS).map((c) => <code key={c} className="mr-1">{c}</code>)}. Dosya <strong>yalnızca tarayıcında</strong> okunur, hiçbir sunucuya yüklenmez; maaş, TC kimlik, telefon, e-posta, adres gibi kişisel/mali sütunlar <strong>okunmaz</strong>. Yalnızca ad, pozisyon, ekip, bağlı olduğu kişi, statü ve işe giriş alınır.</p>
        <label className="btn w-fit cursor-pointer"><Upload size={15} aria-hidden /> Dosya seç<input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} /></label>
        {fileErr && <p role="alert" className="text-sm text-magenta">{fileErr}</p>}
        {meta && <p className="text-xs text-muted">Sayfa: <code>{meta.sheet}</code> · {rows?.length ?? 0} satır{meta.skipped ? ` · ${meta.skipped} boş atlandı` : ''}{meta.ignored.length ? ` · yok sayılan sütunlar: ${meta.ignored.join(', ')}` : ''}{meta.unknown.length ? ` · tanınmayan: ${meta.unknown.join(', ')}` : ''}</p>}
        {rows && rows.length > 0 && (
          <>
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Ad Soyad</th><th>Pozisyon</th><th>Ekip</th><th>Bağlı olduğu</th><th>Statü</th><th>İşe giriş</th><th>Rol</th></tr></thead><tbody>
              {rows.slice(0, 50).map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.title}</td><td>{r.team ?? '—'}</td><td>{r.manager_name ?? '—'}{r.manager_name && !resolveManager(r.manager_name, [...team, ...rows.map((x, j) => ({ id: `r${j}`, name: x.name }))]) && <span className="chip chip-warn ml-1">eşleşmedi</span>}</td><td>{r.status === 'active' ? 'Aktif' : 'Ayrıldı'}</td><td>{r.hired_at ?? '—'}</td><td>{ROLE_LABELS[r.app_role ?? 'creative']}</td></tr>)}
            </tbody></table>{rows.length > 50 && <p className="text-xs text-muted">İlk 50 satır gösteriliyor; hepsi içe aktarılır.</p>}</div>
            <button className="btn btn-primary w-fit" disabled={busy} onClick={() => void importRows()}>{busy ? 'Aktarılıyor…' : `${rows.length} kişiyi içe aktar`}</button>
          </>
        )}
        {result && <p className="text-sm text-[#3ddc97]">{result}</p>}
      </section>
      <section className="card">
        <h2 className="mb-2 font-bold">Ekip ({team.length})</h2>
        {team.length === 0 ? <p className="text-sm text-muted">Henüz kimse yok.</p> : <ul className="grid gap-1 text-sm sm:grid-cols-2">{team.map((t) => <li key={t.id} className="nested flex items-center justify-between gap-2"><span className="truncate"><strong>{t.name}</strong><span className="ml-2 text-xs text-muted">{t.role_title}{t.team ? ` · ${t.team}` : ''}</span></span><span className="text-xs text-muted">{t.manager_id ? `→ ${team.find((m) => m.id === t.manager_id)?.name ?? '—'}` : ''}</span></li>)}</ul>}
        <p className="mt-3 text-xs text-muted">Hesap daveti (e-posta) {mode === 'supabase' && ADMIN_URL ? <a className="underline" href={`${ADMIN_URL}/admin/users`} target="_blank" rel="noreferrer">Ana Yönetim Paneli → Kullanıcılar & Roller</a> : 'Ana Yönetim Paneli → Kullanıcılar & Roller'}’den gönderilir; burada yalnızca çalışan kaydı açılır.</p>
      </section>
      <button className="btn btn-primary w-fit" onClick={() => void onNext()}>Devam <ArrowRight size={15} aria-hidden /></button>
    </div>
  );
}
function ManualAdd({ team, onAdded }: { team: TeamMember[]; onAdded(): void }) {
  const { repo } = useSession();
  const { act, busy, Err } = useAct();
  const teams = Array.from(new Set(team.map((t) => t.team).filter((x): x is string => !!x)));
  return (
    <form className="card grid gap-3" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const ok = await act(() => repo!.addEmployee({ name: String(f.get('name')), role_title: String(f.get('title')), team: String(f.get('team') || '') || null, manager_id: String(f.get('manager') || '') || null, app_role: (String(f.get('role')) || 'creative') as TeamMember['app_role'] })); if (ok) { form.reset(); onAdded(); } }}>
      <h2 className="font-bold">Kişi ekle</h2>{Err}
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="m-name">Ad Soyad</label><input id="m-name" name="name" className="input" required minLength={2} /></div>
        <div><label className="label" htmlFor="m-title">Pozisyon</label><input id="m-title" name="title" className="input" /></div>
        <div><label className="label" htmlFor="m-role">Uygulama rolü</label><select id="m-role" name="role" className="input" defaultValue="creative">{(['creative', 'account', 'pm', 'operations', 'finance', 'hr', 'freelancer', 'org_admin'] as const).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        <div><label className="label" htmlFor="m-team">Ekip</label><input id="m-team" name="team" className="input" list="teams" /><datalist id="teams">{teams.map((t) => <option key={t} value={t} />)}</datalist></div>
        <div><label className="label" htmlFor="m-mgr">Bağlı olduğu</label><select id="m-mgr" name="manager" className="input" defaultValue=""><option value="">—</option>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="m-mail">E-posta (davet için)</label><input id="m-mail" name="email" type="email" className="input" placeholder="isteğe bağlı" /></div>
      </div>
      <p className="text-xs text-muted">E-posta burada saklanmaz; daveti Ana Yönetim Paneli’nden gönderip çalışanı hesaba bağla.</p>
      <button className="btn w-fit" disabled={busy}>Ekle</button>
    </form>
  );
}

/* ───────── 3 · Modüller (paketler) ───────── */
function ModulesStep({ settings, onNext }: { settings: OrgSettings; onNext(flags: Record<string, boolean>, packs: string[]): Promise<void> }) {
  const { repo, me } = useSession();
  const { act, busy, Err } = useAct();
  const [sel, setSel] = useState<string[]>(() => settings.setup?.packs?.length ? settings.setup.packs : packsFromFlags(settings.feature_flags, moduleFlagKey));
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <div className="card grid gap-4">
      {Err}
      <p className="text-sm text-muted">Paketler modül anahtarlarını (<code>feature_flags</code>) ayarlar; her modül sonradan Ana Yönetim Paneli → Modüller’den tek tek açılıp kapatılabilir. Değişiklik denetim kaydına yazılır.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SETUP_PACKS.map((p) => { const on = sel.includes(p.id); return (
          <button key={p.id} type="button" className={`app-card text-left ${on ? '' : 'is-off'}`} aria-pressed={on} onClick={() => toggle(p.id)}>
            <div className="flex items-center justify-between"><strong>{p.label}</strong><span className={`chip ${on ? 'chip-ok' : ''}`}>{on ? 'Açık' : 'Kapalı'}</span></div>
            <p className="text-sm text-muted">{p.desc}</p>
          </button>
        ); })}
      </div>
      {me?.role !== 'owner' && <p className="text-xs text-muted">Not: paket uygulaması owner içindir; org_admin olarak kaydettiğinde yalnızca seçim saklanır, bayraklar panelden uygulanır.</p>}
      <button className="btn btn-primary w-fit" disabled={busy} onClick={() => void act(async () => {
        const flags = me?.role === 'owner' ? packsToFlags(sel, settings.feature_flags, moduleFlagKey) : (settings.feature_flags ?? {});
        await repo!.audit('setup.packs', 'organizations/settings', { packs: sel, applied: me?.role === 'owner' });
        await onNext(flags, sel);
      })}>Uygula ve devam <ArrowRight size={15} aria-hidden /></button>
    </div>
  );
}

/* ───────── 4 · Entegrasyonlar ───────── */
function IntegrationsStep({ onNext }: { onNext(): Promise<void> }) {
  const { mode, me } = useSession();
  const q = useData((r) => r.getConnect().catch(() => null));
  const [hub, setHub] = useState<{ connected: boolean; token: string | null } | null>(null);
  const [hubErr, setHubErr] = useState<string | null>(null);
  const [google, setGoogle] = useState<string>('—');
  const loadHub = useCallback(() => { fetch('/api/setup/hubspot', { cache: 'no-store' }).then((r) => r.json()).then((j) => setHub(j.error ? { connected: false, token: null } : j), () => setHub({ connected: false, token: null })); }, []);
  useEffect(loadHub, [loadHub]);
  useEffect(() => {
    if (!isSupabaseConfigured()) { setGoogle('Demo modu — Google girişi Supabase ile gelir'); return; }
    createBrowser().auth.getUser().then(({ data }) => { const p = (data.user?.app_metadata?.providers as string[] | undefined) ?? []; setGoogle(p.includes('google') ? `Google ile giriş yapıldı (${me?.email})` : `Bu hesap ${p.join(', ') || 'e-posta'} ile giriş yaptı; Google sağlayıcısı Supabase → Authentication → Providers’tan açılır.`); }, () => setGoogle('—'));
  }, [me]);
  const trello = q.data?.integrations.find((i) => i.provider === 'trello');
  const submitHub = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setHubErr(null);
    const token = String(new FormData(e.currentTarget).get('token') ?? '');
    const r = await fetch('/api/setup/hubspot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    const j = await r.json(); if (!r.ok) { setHubErr(j.error ?? 'Kaydedilemedi'); return; }
    e.currentTarget?.reset?.(); loadHub();
  };
  return (
    <div className="grid gap-4">
      <section className="card grid gap-2">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Trello</h2><span className={`chip ${trello?.status === 'connected' ? 'chip-ok' : ''}`}>{trello?.status === 'connected' ? 'Bağlı' : 'Bağlı değil'}</span></div>
        <p className="text-sm text-muted">Panoları içe aktarma, iki yönlü eşitleme ve webhook kurulumu Ana Yönetim Paneli → Entegrasyonlar’dadır.</p>
        {ADMIN_URL ? <a className="btn w-fit" href={`${ADMIN_URL}/admin/integrations`} target="_blank" rel="noreferrer">Trello’yu bağla <ExternalLink size={14} aria-hidden /></a> : <p className="text-xs text-muted">NEXT_PUBLIC_ADMIN_URL tanımlı değil.</p>}
      </section>
      <section className="card grid gap-2">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">HubSpot</h2><span className={`chip ${hub?.connected ? 'chip-ok' : ''}`}>{hub?.connected ? `Bağlı · ${hub.token}` : 'Bağlı değil'}</span></div>
        <p className="text-sm text-muted">Özel uygulama (private app) erişim token’ı. Yalnızca sunucuda saklanır, arayüzde maskeli görünür; kaydetme ve kaldırma denetim kaydına yazılır.</p>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => void submitHub(e)}>
          <input name="token" className="input w-auto min-w-64" type="password" placeholder="pat-eu1-…" minLength={20} required autoComplete="off" aria-label="HubSpot token" />
          <button className="btn btn-primary">{hub?.connected ? 'Token’ı değiştir' : 'Bağla'}</button>
          {hub?.connected && <button type="button" className="btn" onClick={() => { void fetch('/api/setup/hubspot', { method: 'DELETE' }).then(loadHub); }}>Kaldır</button>}
        </form>
        {hubErr && <p role="alert" className="text-sm text-magenta">{hubErr}</p>}
        {mode === 'demo' && <p className="text-xs text-muted">Demo: token saklanmaz, yalnızca durum “bağlı” olur.</p>}
      </section>
      <section className="card grid gap-2">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Google ile giriş</h2><ShieldCheck size={16} aria-hidden /></div>
        <p className="text-sm text-muted">{google}</p>
        {ADMIN_URL && <a className="text-button" href={`${ADMIN_URL}/admin/security`} target="_blank" rel="noreferrer">İzinli e-posta alan adları (Güvenlik) <ExternalLink size={14} aria-hidden /></a>}
      </section>
      <button className="btn btn-primary w-fit" onClick={() => void onNext()}>Devam <ArrowRight size={15} aria-hidden /></button>
    </div>
  );
}

/* ───────── 5 · İlk marka & proje ───────── */
function FirstStep({ onNext }: { onNext(): Promise<void> }) {
  const q = useData(async (r) => ({ brands: await r.listBrands(), projects: await r.listProjects() }));
  const [made, setMade] = useState<{ p: Project | null; b: Brand | null } | null>(null);
  const brands = q.data?.brands ?? [];
  return (
    <div className="grid gap-4">
      {q.data && q.data.projects.length > 0 && <p className="card text-sm text-muted">Zaten {q.data.brands.length} marka ve {q.data.projects.length} proje var. İstersen yeni bir tane daha aç ya da devam et.</p>}
      {q.data && !made && <QuickCreate key={brands.length} brands={brands} compact autoOpen onCreated={(p, b) => { setMade({ p, b }); q.reload(); }} />}
      {made && <p className="card flex items-center gap-2 text-sm"><CheckCircle2 size={16} aria-hidden className="text-[#3ddc97]" /> {made.b?.name} · <Link className="underline" href={`/app/projects/${made.p?.id}`}>{made.p?.name}</Link> oluşturuldu.</p>}
      <button className="btn btn-primary w-fit" onClick={() => void onNext()}>Devam <ArrowRight size={15} aria-hidden /></button>
    </div>
  );
}

/* ───────── 6 · Özet ───────── */
function SummaryStep({ setup, settings, onComplete }: { setup: SetupState; settings: OrgSettings; onComplete(): Promise<void> }) {
  const { act, busy, Err } = useAct();
  const missing = SETUP_STEPS.filter((s) => s !== 'summary' && !setup.done.includes(s));
  return (
    <div className="card grid gap-4">
      {Err}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="nested"><dt className="text-xs text-muted">Organizasyon</dt><dd className="font-semibold">{settings.general.name} · {settings.general.timezone} · {settings.general.currency}</dd></div>
        <div className="nested"><dt className="text-xs text-muted">Çalışma saatleri</dt><dd className="font-semibold">{settings.structure.work_hours}</dd></div>
        <div className="nested"><dt className="text-xs text-muted">Paketler</dt><dd className="font-semibold">{setup.packs.length ? setup.packs.map((p) => SETUP_PACKS.find((x) => x.id === p)?.label ?? p).join(', ') : 'Hepsi (varsayılan)'}</dd></div>
        <div className="nested"><dt className="text-xs text-muted">Tamamlanan adımlar</dt><dd className="font-semibold">{setup.done.filter((s) => s !== 'summary').map((s) => SETUP_STEP_LABELS[s]).join(', ') || '—'}</dd></div>
      </dl>
      {missing.length > 0 && <p className="text-sm text-muted">Atlanan adımlar: {missing.map((s) => SETUP_STEP_LABELS[s]).join(', ')}. Tamamladıktan sonra da düzenleyebilirsin; kurulum Ana Yönetim Paneli → Kurulum’dan yeniden açılabilir.</p>}
      <button className="btn btn-primary w-fit" disabled={busy} onClick={() => void act(onComplete)}><Check size={15} aria-hidden /> Kurulumu tamamla</button>
    </div>
  );
}
