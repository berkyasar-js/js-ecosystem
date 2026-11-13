'use client';
import { useMemo } from 'react';
import { CHART_IDS, buildDashboards, type AgentRun, type ChartId } from '@jscore/contracts';
import { DashChart } from '@/components/dash-chart';
import { ModulePage } from '@/components/mod';
import { useSession } from '@/components/session';
import { Async, todayFor, useData } from '@/components/ui';

/** Panolar (0017): 6 yerleşik grafik (SVG/CSS çubuk; grafik kütüphanesi yok). Veri Repo'dan; "Ana sayfaya sabitle" user_prefs.pinned_charts. */
export default function DashboardsPage() {
  const { mode, prefs, setPrefs, features } = useSession();
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [tasks, team, brands, approvals, runs, settings] = await Promise.all([safe(r.listTasks()), safe(r.team()), safe(r.listBrands()), safe(r.listApprovals()), safe(r.listAgentRuns()), r.getSettings().catch(() => null)]);
    return { tasks, team, brands, approvals, runs: runs as AgentRun[], usdTry: settings?.ai.usd_try ?? 40 };
  });
  const today = todayFor(mode);
  const pinned = useMemo(() => new Set(prefs.pinned_charts), [prefs.pinned_charts]);
  const togglePin = (id: ChartId) => void setPrefs({ pinned_charts: pinned.has(id) ? prefs.pinned_charts.filter((x) => x !== id) : [...prefs.pinned_charts, id].slice(-6) });
  return (
    <ModulePage id="dashboards" title="Panolar" sub={`${features.orgName ?? 'Organizasyon'} · görev, gecikme, iş yükü, marka sağlığı, onay yaşı, ajan maliyeti`} tabs={[['all', 'Tümü']]}>
      {() => (
        <Async q={q}>{(d) => {
          const charts = buildDashboards({ ...d, today });
          return (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CHART_IDS.map((id) => { const c = charts.find((x) => x.id === id)!; return <DashChart key={id} chart={c} pinned={pinned.has(id)} onPin={() => togglePin(id)} />; })}
              <p className="text-xs text-muted md:col-span-2 xl:col-span-3">Sabitlenen grafikler Ana Sayfa’da “Panolarım” bölümünde görünür. Ajan maliyeti ₺ = agent_runs maliyeti × kur (Ana Yönetim Paneli → Ajanlar).</p>
            </div>
          );
        }}</Async>
      )}
    </ModulePage>
  );
}
