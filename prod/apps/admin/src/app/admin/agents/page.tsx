'use client';
import { useEffect, useState } from 'react';
import type { OrgSettings } from '@jscore/contracts';
import { DEFAULT_USD_TRY, fmtTry } from '@jscore/core/agents/cap';
import { Async, PageHeader, fmtTime, useData } from '@/components/ui';
import { CapMeter } from '@/components/cap-meter';
import { Msg, errText } from '@/components/admin-ui';
import { useSession } from '@/components/session';
import { useAdminSettings, useApi } from '@/lib/client';

interface Prompt { id: string; agent: string; version: number; model: string; is_active: boolean; org_id?: string | null; created_at?: string }
interface Run { id: string; agent: string; model: string; tokens_in: number; tokens_out: number; cost_usd: number | string; status: string; created_at: string; trigger?: string; latency_ms?: number }
interface AgentsData { prompts: Prompt[]; runs: Run[] }

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
  useEffect(() => { if (st.settings) setAi(st.settings.ai); }, [st.settings]);
  const save = async () => { if (!ai) return; try { await st.save({ ai }); setMsg({ ok: true, text: 'Kaydedildi.' }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } };
  return (
    <>
      <PageHeader title="Ajanlar & Maliyet" sub="Aylık tavan, varsayılan model, prompt sürümleri ve çalıştırma günlüğü" />
      <Msg m={msg} />
      <div className="grid gap-5">
        <section className="card grid max-w-3xl gap-4">
          <h2 className="font-bold">Maliyet ve model</h2>
          <CapMeter />
          {ai && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="cap">Aylık maliyet tavanı (USD) · 0 = tavan yok</label><input id="cap" type="number" min={0} className="input" value={ai.monthly_cap_usd} onChange={(e) => setAi({ ...ai, monthly_cap_usd: Number(e.target.value) })} />
                  <p className="mt-1 text-xs text-muted">≈ {fmtTry(ai.monthly_cap_usd * (ai.usd_try ?? DEFAULT_USD_TRY))} — tavan aşılırsa ajan çalıştırmaları 402 ile reddedilir.</p></div>
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
            <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Prompt sürümleri</h2>
              <table className="table"><thead><tr><th>Ajan</th><th>Sürüm</th><th>Model</th><th>Kapsam</th><th>Durum</th></tr></thead><tbody>
                {prompts.map((p) => <tr key={p.id}><td>{p.agent}</td><td>v{p.version}</td><td>{p.model}</td><td>{p.org_id === null ? 'Genel' : 'Organizasyon'}</td><td><span className={`chip ${p.is_active ? 'chip-ok' : ''}`}>{p.is_active ? 'Aktif' : 'Eski'}</span></td></tr>)}
              </tbody></table>
              <p className="mt-2 text-xs text-muted">Yeni sürüm: <code>npm run prompts:sql</code> ile üretilip veritabanına uygulanır (packages/prompts).</p></section>
            <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Çalıştırma günlüğü · toplam ${runs.reduce((a, r) => a + Number(r.cost_usd), 0).toFixed(4)}</h2>
              <table className="table"><thead><tr><th>Ajan</th><th>Model</th><th>Token</th><th>Maliyet</th><th>Durum</th><th>Zaman</th></tr></thead><tbody>
                {runs.map((r) => <tr key={r.id}><td>{r.agent}</td><td>{r.model}</td><td>{r.tokens_in}/{r.tokens_out}</td><td>${Number(r.cost_usd).toFixed(4)}</td><td><span className={`chip ${r.status === 'error' ? 'chip-bad' : ''}`}>{r.status}</span></td><td>{fmtTime(r.created_at)}</td></tr>)}
              </tbody></table></section>
          </>
        )}</Async>
      </div>
    </>
  );
}
