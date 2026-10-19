'use client';
import { useEffect, useState } from 'react';
import { ROLE_LABELS, type OrgSettings } from '@jscore/contracts';
import Link from 'next/link';
import { Async, PageHeader, Tabs, fmtTime, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { CapMeter } from '@/components/cap-meter';
import { DEFAULT_USD_TRY, fmtTry } from '@/lib/agents/cap';

type Tab = 'genel' | 'bildirimler' | 'yapi' | 'ai' | 'kullanicilar' | 'guvenlik';

export default function Admin() {
  const { repo, bump } = useSession();
  const q = useData(async (r) => ({ settings: await r.getSettings(), members: await r.listMembers().catch(() => []), prompts: await r.listAgentPrompts().catch(() => []), runs: await r.listAgentRuns().catch(() => []) }));
  const [tab, setTab] = useState<Tab>('genel');
  const [s, setS] = useState<OrgSettings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data) setS(q.data.settings); }, [q.data]);
  const save = async (patch: Partial<OrgSettings>) => {
    try { await repo?.saveSettings(patch); setMsg({ ok: true, text: 'Kaydedildi.' }); bump(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Kaydedilemedi' }); }
  };
  return (
    <>
      <PageHeader title="JS Core · Admin" sub="Admin Control Center" actions={<Link className="btn" href="/app/theme-preview">ORBIT tema önizleme</Link>} />
      <Tabs<Tab> tabs={[['genel', 'Genel'], ['bildirimler', 'Bildirimler'], ['yapi', 'Yapı'], ['ai', 'Yapay zekâ'], ['kullanicilar', 'Kullanıcılar'], ['guvenlik', 'Güvenlik']]} value={tab} onChange={(t) => { setTab(t); setMsg(null); }} />
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-3 text-sm ${msg.ok ? 'text-[#3ddc97]' : 'text-magenta'}`}>{msg.text}</p>}
      <Async q={q}>{({ members, prompts, runs }) => s && (
        <div className="card max-w-3xl">
          {tab === 'genel' && (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void save({ general: s.general }); }}>
              <div><label className="label" htmlFor="n">Organizasyon adı</label><input id="n" className="input" value={s.general.name} onChange={(e) => setS({ ...s, general: { ...s.general, name: e.target.value } })} /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                {(['locale', 'timezone', 'currency'] as const).map((k) => <div key={k}><label className="label" htmlFor={k}>{k === 'locale' ? 'Dil' : k === 'timezone' ? 'Saat dilimi' : 'Para birimi'}</label><input id={k} className="input" value={s.general[k]} onChange={(e) => setS({ ...s, general: { ...s.general, [k]: e.target.value } })} /></div>)}
              </div>
              <button className="btn btn-primary w-fit">Kaydet</button>
            </form>
          )}
          {tab === 'bildirimler' && (
            <div className="grid gap-3">
              {s.notifications.rules.map((r, i) => (
                <label key={r.event} className="nested flex items-center justify-between gap-3">
                  <span><code>{r.event}</code> <span className="chip ml-2">{r.channel}</span></span>
                  <input type="checkbox" checked={r.enabled} onChange={(e) => setS({ ...s, notifications: { rules: s.notifications.rules.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)) } })} />
                </label>
              ))}
              <button className="btn btn-primary w-fit" onClick={() => save({ notifications: s.notifications })}>Kaydet</button>
            </div>
          )}
          {tab === 'yapi' && (
            <div className="grid gap-4">
              <div><div className="label">Akış aşamaları</div><div className="flex flex-wrap gap-2">{s.structure.flow_stages.map((f) => <span key={f} className="chip chip-brand">{f}</span>)}</div></div>
              <div><label className="label" htmlFor="wh">Çalışma saatleri</label><input id="wh" className="input max-w-xs" value={s.structure.work_hours} onChange={(e) => setS({ ...s, structure: { ...s.structure, work_hours: e.target.value } })} /></div>
              <button className="btn btn-primary w-fit" onClick={() => save({ structure: s.structure })}>Kaydet</button>
            </div>
          )}
          {tab === 'ai' && (
            <div className="grid gap-4">
              <CapMeter />
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="cap">Aylık maliyet tavanı (USD) · 0 = tavan yok</label><input id="cap" type="number" min={0} className="input" value={s.ai.monthly_cap_usd} onChange={(e) => setS({ ...s, ai: { ...s.ai, monthly_cap_usd: Number(e.target.value) } })} />
                  <p className="mt-1 text-xs text-muted">≈ {fmtTry(s.ai.monthly_cap_usd * (s.ai.usd_try ?? DEFAULT_USD_TRY))} — tavan aşılırsa ajan çalıştırmaları 402 ile reddedilir.</p></div>
                <div><label className="label" htmlFor="fx">Kur (₺ / USD)</label><input id="fx" type="number" min={1} step="0.01" className="input" value={s.ai.usd_try ?? DEFAULT_USD_TRY} onChange={(e) => setS({ ...s, ai: { ...s.ai, usd_try: Number(e.target.value) || DEFAULT_USD_TRY } })} /></div>
                <div><label className="label" htmlFor="mdl">Varsayılan model</label><input id="mdl" className="input" value={s.ai.default_model} onChange={(e) => setS({ ...s, ai: { ...s.ai, default_model: e.target.value } })} /></div>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.ai.board_enabled} onChange={(e) => setS({ ...s, ai: { ...s.ai, board_enabled: e.target.checked } })} /> Haftalık kurul açık</label>
              <button className="btn btn-primary w-fit" onClick={() => save({ ai: s.ai })}>Kaydet</button>
              <div><div className="label">Aktif promptlar</div><div className="flex flex-wrap gap-2">{prompts.filter((p) => p.is_active).map((p) => <span key={p.id} className="chip">{p.agent} v{p.version} · {p.model}</span>)}</div></div>
              <div className="overflow-x-auto"><div className="label">Son çalıştırmalar · toplam ${runs.reduce((a, r) => a + Number(r.cost_usd), 0).toFixed(4)}</div>
                <table className="table"><thead><tr><th>Ajan</th><th>Model</th><th>Token</th><th>Maliyet</th><th>Durum</th><th>Zaman</th></tr></thead><tbody>
                  {runs.map((r) => <tr key={r.id}><td>{r.agent}</td><td>{r.model}</td><td>{r.tokens_in}/{r.tokens_out}</td><td>${Number(r.cost_usd).toFixed(4)}</td><td>{r.status}</td><td>{fmtTime(r.created_at)}</td></tr>)}
                </tbody></table></div>
            </div>
          )}
          {tab === 'kullanicilar' && (
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th></tr></thead><tbody>
              {members.map((m) => <tr key={m.user_id}><td>{m.name}</td><td>{m.email}</td><td><span className="chip chip-brand">{ROLE_LABELS[m.role]}</span></td><td>{m.status}</td></tr>)}
            </tbody></table></div>
          )}
          {tab === 'guvenlik' && (
            <div className="grid gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.security.mfa_required} onChange={(e) => setS({ ...s, security: { ...s.security, mfa_required: e.target.checked } })} /> MFA zorunlu</label>
              <div><label className="label" htmlFor="sh">Oturum süresi (saat)</label><input id="sh" type="number" min={1} max={720} className="input max-w-xs" value={s.security.session_hours} onChange={(e) => setS({ ...s, security: { ...s.security, session_hours: Number(e.target.value) } })} /></div>
              <div><label className="label" htmlFor="ip">IP izin listesi (satır başına bir)</label><textarea id="ip" className="input min-h-24" value={s.security.ip_allowlist.join('\n')} onChange={(e) => setS({ ...s, security: { ...s.security, ip_allowlist: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) } })} /></div>
              <button className="btn btn-primary w-fit" onClick={() => save({ security: s.security })}>Kaydet</button>
            </div>
          )}
        </div>
      )}</Async>
    </>
  );
}
