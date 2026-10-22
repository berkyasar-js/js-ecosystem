'use client';
import Link from 'next/link';
import { Async, PageHeader, Stat, fmtTime, useData } from '@/components/ui';
import { CapMeter } from '@/components/cap-meter';
import { NeedsSupabase } from '@/components/admin-ui';
import { useSession } from '@/components/session';
import { useApi } from '@/lib/client';

interface Overview {
  health: Record<'supabase' | 'anthropic' | 'trello' | 'cron', { ok: boolean; detail: string }> & { env: Record<string, boolean> };
  counts: Record<string, number | null>;
  ai: { spentTry: number; capTry: number; unlimited: boolean; pct: number; exceeded: boolean };
  recent_audit: Array<{ id: string; actor: string | null; action: string; resource: string; outcome: string; occurred_at: string }>;
  org: { name: string; slug: string };
}
const HEALTH: Array<['supabase' | 'anthropic' | 'trello' | 'cron', string]> = [['supabase', 'Supabase'], ['anthropic', 'Anthropic'], ['trello', 'Trello'], ['cron', 'Cron / olay hattı']];
const ENV_LABELS: Record<string, string> = { service_role: 'SUPABASE_SERVICE_ROLE_KEY', app_url: 'NEXT_PUBLIC_APP_URL', cron_secret: 'CRON_SECRET', webhook_secret: 'JSCORE_WEBHOOK_SECRET' };

export default function Overview() {
  const { mode } = useSession();
  return (
    <>
      <PageHeader title="Genel bakış" sub="Sistem sağlığı, sayılar ve son yönetim işlemleri" />
      {mode === 'demo' ? <DemoOverview /> : <Live />}
    </>
  );
}

function Live() {
  const q = useApi<Overview>('/api/admin/overview');
  return (
    <Async q={q}>{(d) => (
      <div className="grid gap-5">
        <section aria-label="Sağlık" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {HEALTH.map(([k, label]) => (
            <div key={k} className="card"><div className="flex items-center justify-between gap-2"><h2 className="font-bold">{label}</h2><span className={`chip ${d.health[k].ok ? 'chip-ok' : 'chip-bad'}`}>{d.health[k].ok ? 'Tamam' : 'Sorun'}</span></div><p className="mt-2 text-xs text-muted">{d.health[k].detail}</p></div>
          ))}
        </section>
        <section aria-label="Sayılar" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Stat label="Aktif üye" value={d.counts.members ?? '—'} hint={d.counts.disabled ? `${d.counts.disabled} devre dışı` : undefined} href="/admin/users" />
          <Stat label="Çalışan" value={d.counts.employees ?? '—'} href="/admin/employees" />
          <Stat label="Proje" value={d.counts.projects ?? '—'} />
          <Stat label="Görev" value={d.counts.tasks ?? '—'} />
          <Stat label="Bekleyen onay" value={d.counts.pending_approvals ?? '—'} tone={d.counts.pending_approvals ? 'warn' : 'ok'} />
          <Stat label="API anahtarı" value={d.counts.api_tokens ?? '—'} href="/admin/integrations" />
          <Stat label="Senkron hatası (24 sa)" value={d.counts.sync_errors_24h ?? '—'} tone={d.counts.sync_errors_24h ? 'bad' : 'ok'} href="/admin/audit?source=sync&outcome=error" />
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card"><h2 className="mb-2 font-bold">Yapay zekâ maliyeti (bu ay)</h2><p className="text-sm"><strong>₺{Math.round(d.ai.spentTry).toLocaleString('tr-TR')}</strong> / {d.ai.unlimited ? 'tavan yok' : `₺${Math.round(d.ai.capTry).toLocaleString('tr-TR')}`} {d.ai.exceeded && <span className="chip chip-bad">Tavan aşıldı</span>}</p>{!d.ai.unlimited && <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className={`h-full ${d.ai.exceeded ? 'bg-magenta' : 'bg-[#3ddc97]'}`} style={{ width: `${d.ai.pct}%` }} /></div>}<Link className="mt-3 inline-block text-sm underline" href="/admin/agents">Ajanlar & Maliyet →</Link></section>
          <section className="card"><h2 className="mb-2 font-bold">Ortam değişkenleri (yönetim paneli)</h2>
            <ul className="grid gap-1 text-sm">{Object.entries(d.health.env).map(([k, v]) => <li key={k} className="flex justify-between"><code>{ENV_LABELS[k] ?? k}</code><span className={`chip ${v ? 'chip-ok' : 'chip-warn'}`}>{v ? 'tanımlı' : 'yok'}</span></li>)}</ul>
            <p className="mt-2 text-xs text-muted">Kullanıcı uygulamasının (apps/web) ortamı ayrıdır; Vercel’de ayrı kontrol edin.</p></section>
        </div>
        <section className="card overflow-x-auto"><div className="mb-2 flex items-center justify-between"><h2 className="font-bold">Son denetim kayıtları</h2><Link className="text-sm underline" href="/admin/audit">Tümü →</Link></div>
          <table className="table"><thead><tr><th>Zaman</th><th>Eylem</th><th>Kaynak</th><th>Sonuç</th></tr></thead><tbody>
            {d.recent_audit.map((r) => <tr key={r.id}><td>{fmtTime(r.occurred_at)}</td><td><code>{r.action}</code></td><td className="max-w-[260px] truncate">{r.resource}</td><td><span className={`chip ${r.outcome === 'allow' ? 'chip-ok' : 'chip-bad'}`}>{r.outcome}</span></td></tr>)}
          </tbody></table></section>
      </div>
    )}</Async>
  );
}

function DemoOverview() {
  const q = useData(async (r) => ({ projects: (await r.listProjects()).length, tasks: (await r.listTasks()).length, approvals: (await r.listApprovals()).filter((a) => a.status === 'pending').length, members: (await r.listMembers().catch(() => [])).length, audit: (await r.listAudit().catch(() => [])).slice(0, 10) }));
  return (
    <div className="grid gap-5">
      <NeedsSupabase>{null}</NeedsSupabase>
      <Async q={q}>{(d) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Üye" value={d.members} /><Stat label="Proje" value={d.projects} /><Stat label="Görev" value={d.tasks} /><Stat label="Bekleyen onay" value={d.approvals} /></div>
          <CapMeter className="max-w-xl" />
          <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Son denetim kayıtları</h2>
            <table className="table"><thead><tr><th>Zaman</th><th>Eylem</th><th>Kaynak</th></tr></thead><tbody>{d.audit.map((a) => <tr key={a.id}><td>{fmtTime(a.occurred_at)}</td><td><code>{a.action}</code></td><td>{a.resource}</td></tr>)}</tbody></table></section>
        </>
      )}</Async>
    </div>
  );
}
