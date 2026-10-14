'use client';
import { useState } from 'react';
import { Async, Empty, PageHeader, Tabs, fmtDate, useData } from '@/components/ui';
import { useSession } from '@/components/session';

export default function Connect() {
  const { repo, bump } = useSession();
  const q = useData((r) => r.getConnect());
  const [tab, setTab] = useState<'int' | 'mcp' | 'api'>('int');
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="JS Connect" sub="Entegrasyonlar, MCP sunucuları, API ve webhook’lar" />
      <Tabs<typeof tab> tabs={[['int', 'Entegrasyonlar'], ['mcp', 'MCP sunucuları'], ['api', 'API & Webhook’lar']]} value={tab} onChange={setTab} />
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      <Async q={q}>{(d) => tab === 'int' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.integrations.map((i) => (
            <article key={i.id} className="card">
              <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{i.name}</h2><span className={`chip ${i.status === 'connected' ? 'chip-ok' : i.status === 'error' ? 'chip-bad' : ''}`}>{i.status === 'connected' ? 'Bağlı' : i.status === 'error' ? 'Hata' : 'Hazır'}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{i.scopes.map((s) => <span key={s} className="chip">{s}</span>)}</div>
              <button className="btn btn-sm mt-4" onClick={async () => { try { await repo?.setIntegrationStatus(i.id, i.status === 'connected' ? 'available' : 'connected'); setErr(null); bump(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } }}>{i.status === 'connected' ? 'Bağlantıyı kes' : 'Bağla'}</button>
            </article>
          ))}
        </div>
      ) : tab === 'mcp' ? (
        d.mcp_servers.length === 0 ? <Empty>MCP sunucusu yok.</Empty> : (
          <ul className="grid gap-3">{d.mcp_servers.map((m) => (
            <li key={m.id} className="card"><div className="flex items-center justify-between"><h2 className="font-bold">{m.name}</h2><span className={`chip ${m.status === 'connected' ? 'chip-ok' : ''}`}>{m.status === 'connected' ? 'Bağlı' : 'Hazır'}</span></div>
              <code className="mt-2 block text-xs text-muted">{m.url}</code>
              <div className="mt-3 flex flex-wrap gap-1.5">{m.tools.map((t) => <span key={t} className="chip chip-brand">{t}</span>)}</div></li>
          ))}</ul>
        )
      ) : (
        <div className="grid gap-5">
          <section className="card">
            <h2 className="mb-2 font-bold">MCP uç noktası</h2>
            <pre className="overflow-x-auto rounded-control bg-nested p-3 text-xs">{`curl -X POST $APP_URL/api/mcp \\\n  -H "Authorization: Bearer <token>" -H "content-type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
          </section>
          <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Erişim token’ları</h2>
            <table className="table"><thead><tr><th>Ad</th><th>Önek</th><th>Kapsam</th><th>Son kullanım</th></tr></thead><tbody>
              {d.tokens.map((t) => <tr key={t.id}><td>{t.name}</td><td><code>{t.token_prefix}</code></td><td>{t.scopes.join(', ')}</td><td>{t.last_used_at ? fmtDate(t.last_used_at) : '—'}</td></tr>)}
            </tbody></table></section>
          <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Webhook’lar</h2>
            <table className="table"><thead><tr><th>Sağlayıcı</th><th>URL</th><th>Olaylar</th><th>Durum</th></tr></thead><tbody>
              {d.webhooks.map((w) => <tr key={w.id}><td>{w.provider}</td><td><code>{w.url}</code></td><td>{w.events.join(', ')}</td><td><span className={`chip ${w.active ? 'chip-ok' : ''}`}>{w.active ? 'Aktif' : 'Pasif'}</span></td></tr>)}
            </tbody></table>
            <p className="mt-3 text-xs text-muted">İmza: <code>x-jscore-signature: sha256=&lt;HMAC-SHA256(gövde, JSCORE_WEBHOOK_SECRET)&gt;</code></p></section>
        </div>
      )}</Async>
    </>
  );
}
