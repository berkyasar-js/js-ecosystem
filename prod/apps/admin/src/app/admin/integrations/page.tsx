'use client';
import { useState } from 'react';
import { API_TOKEN_SCOPES, TOKEN_ADMIN_ROLES } from '@jscore/contracts';
import { Async, Empty, PageHeader, Tabs, fmtDate, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { TrelloCard } from './trello-card';

export default function IntegrationsPage() {
  const { repo, me, mode, bump } = useSession();
  const q = useData((r) => r.getConnect());
  const [tab, setTab] = useState<'int' | 'mcp' | 'api' | 'keys'>('int');
  const [fresh, setFresh] = useState<{ name: string; plaintext: string } | null>(null);
  const canKeys = !!me && TOKEN_ADMIN_ROLES.includes(me.role);
  const [err, setErr] = useState<string | null>(null);
  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : 'Hata');
  /** Supabase: sunucu rotası (POST/DELETE /api/tokens). Demo: bellek içi, aynı arayüz (sunucu durumsuz olduğundan doğrudan istemci repo'su). */
  const create = async (v: { name: string; scopes: string[]; days: number | null }) => {
    try {
      const body = { name: v.name, scopes: v.scopes, expires_in_days: v.days };
      if (mode === 'demo') { const r = await repo!.createToken(body); setFresh({ name: r.token.name, plaintext: r.plaintext }); }
      else {
        const res = await fetch('/api/admin/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const j = (await res.json()) as { token?: { name: string }; plaintext?: string; error?: string };
        if (!res.ok || !j.plaintext) throw new Error(j.error ?? 'Anahtar oluşturulamadı');
        setFresh({ name: j.token?.name ?? v.name, plaintext: j.plaintext });
      }
      setErr(null); bump();
    } catch (e) { fail(e); }
  };
  const revoke = async (id: string) => {
    try {
      if (mode === 'demo') await repo!.revokeToken(id);
      else { const res = await fetch(`/api/admin/tokens?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? 'İptal edilemedi'); }
      setErr(null); bump();
    } catch (e) { fail(e); }
  };
  return (
    <>
      <PageHeader title="Entegrasyonlar" sub="Trello, MCP sunucuları, API anahtarları ve webhook’lar" />
      <Tabs<typeof tab> tabs={[['int', 'Entegrasyonlar'], ['mcp', 'MCP sunucuları'], ['api', 'API & Webhook’lar'], ['keys', 'API Anahtarları']]} value={tab} onChange={setTab} />
      {err && <p role="alert" className="mb-3 text-sm text-magenta">{err}</p>}
      <Async q={q}>{(d) => tab === 'int' ? (
        <>
        <TrelloCard />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {d.integrations.filter((i) => i.provider !== 'trello').map((i) => (
            <article key={i.id} className="card">
              <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{i.name}</h2><span className={`chip ${i.status === 'connected' ? 'chip-ok' : i.status === 'error' ? 'chip-bad' : ''}`}>{i.status === 'connected' ? 'Bağlı' : i.status === 'error' ? 'Hata' : 'Hazır'}</span></div>
              <div className="mt-3 flex flex-wrap gap-1.5">{i.scopes.map((s) => <span key={s} className="chip">{s}</span>)}</div>
              <button className="btn btn-sm mt-4" onClick={async () => { try { await repo?.setIntegrationStatus(i.id, i.status === 'connected' ? 'available' : 'connected'); setErr(null); bump(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } }}>{i.status === 'connected' ? 'Bağlantıyı kes' : 'Bağla'}</button>
            </article>
          ))}
        </div>
        </>
      ) : tab === 'mcp' ? (
        d.mcp_servers.length === 0 ? <Empty>MCP sunucusu yok.</Empty> : (
          <ul className="grid gap-3">{d.mcp_servers.map((m) => (
            <li key={m.id} className="card"><div className="flex items-center justify-between"><h2 className="font-bold">{m.name}</h2><span className={`chip ${m.status === 'connected' ? 'chip-ok' : ''}`}>{m.status === 'connected' ? 'Bağlı' : 'Hazır'}</span></div>
              <code className="mt-2 block text-xs text-muted">{m.url}</code>
              <div className="mt-3 flex flex-wrap gap-1.5">{m.tools.map((t) => <span key={t} className="chip chip-brand">{t}</span>)}</div></li>
          ))}</ul>
        )
      ) : tab === 'keys' ? (
        <KeysTab tokens={d.tokens} canKeys={canKeys} fresh={fresh} onDismiss={() => setFresh(null)} onCreate={create} onRevoke={revoke} demo={mode === 'demo'} />
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

type Token = { id: string; name: string; token_prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; expires_at?: string | null };
const EXPIRY: Array<[string, string]> = [['30', '30 gün'], ['90', '90 gün'], ['365', '1 yıl'], ['', 'Süresiz']];

function KeysTab({ tokens, canKeys, fresh, onDismiss, onCreate, onRevoke, demo }: {
  tokens: Token[]; canKeys: boolean; fresh: { name: string; plaintext: string } | null; demo: boolean; onDismiss(): void;
  onCreate(v: { name: string; scopes: string[]; days: number | null }): Promise<void>; onRevoke(id: string): Promise<void>;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['mcp']);
  const [days, setDays] = useState('90');
  const [copied, setCopied] = useState(false);
  const now = new Date().toISOString();
  return (
    <div className="grid gap-5">
      {fresh && (
        <section className="card border-accent" role="status" aria-live="polite">
          <h2 className="font-bold">“{fresh.name}” oluşturuldu — anahtarı şimdi kopyala</h2>
          <p className="mt-1 text-sm text-muted">Bu anahtar bir daha gösterilmeyecek; yalnızca sha256 özeti saklanır.</p>
          <code className="mt-3 block break-all rounded-control bg-nested p-3 text-xs" data-testid="plaintext-token">{fresh.plaintext}</code>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(fresh.plaintext).then(() => setCopied(true)); }}>{copied ? 'Kopyalandı' : 'Kopyala'}</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setCopied(false); onDismiss(); }}>Kaydettim, kapat</button>
          </div>
        </section>
      )}
      {canKeys ? (
        <form className="card grid gap-4" onSubmit={(e) => { e.preventDefault(); if (name.trim().length < 2 || !scopes.length) return; void onCreate({ name: name.trim(), scopes, days: days ? Number(days) : null }).then(() => setName('')); }}>
          <h2 className="font-bold">Yeni API anahtarı</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="tk-name">Ad</label><input id="tk-name" className="input" required minLength={2} maxLength={80} placeholder="ör. Claude Desktop" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label" htmlFor="tk-exp">Son kullanma</label><select id="tk-exp" className="input" value={days} onChange={(e) => setDays(e.target.value)}>{EXPIRY.map(([v, l]) => <option key={l} value={v}>{l}</option>)}</select></div>
          </div>
          <fieldset><legend className="label">Kapsamlar</legend>
            <div className="flex flex-wrap gap-3">{API_TOKEN_SCOPES.map((sc) => (
              <label key={sc} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes(sc)} onChange={(e) => setScopes((cur) => (e.target.checked ? [...cur, sc] : cur.filter((x) => x !== sc)))} /> <code>{sc}</code></label>
            ))}</div></fieldset>
          <button className="btn btn-primary w-fit" disabled={name.trim().length < 2 || !scopes.length}>Anahtar oluştur</button>
          {demo && <p className="text-xs text-muted">Demo modu: anahtar yalnızca bu tarayıcıda listelenir; sunucu uçları demo için <code>jsdemo_token</code> kabul eder.</p>}
        </form>
      ) : <p className="card text-sm text-muted">API anahtarı oluşturma yalnızca owner, org_admin ve entegrasyon admin rollerindedir.</p>}
      <section className="card overflow-x-auto"><h2 className="mb-2 font-bold">Anahtarlar</h2>
        {tokens.length === 0 ? <p className="text-sm text-muted">Anahtar yok.</p> : (
          <table className="table"><thead><tr><th>Ad</th><th>Önek</th><th>Kapsam</th><th>Son kullanma</th><th>Son kullanım</th><th></th></tr></thead><tbody>
            {tokens.map((t) => { const expired = !!t.expires_at && t.expires_at <= now; return (
              <tr key={t.id}><td>{t.name}</td><td><code>{t.token_prefix}</code></td><td>{t.scopes.join(', ')}</td>
                <td>{t.expires_at ? <>{fmtDate(t.expires_at)} {expired && <span className="chip chip-bad">Süresi doldu</span>}</> : 'Süresiz'}</td>
                <td>{t.last_used_at ? fmtDate(t.last_used_at) : '—'}</td>
                <td>{canKeys && <button className="btn btn-sm" onClick={() => { if (confirm(`“${t.name}” anahtarı iptal edilsin mi? Bu geri alınamaz.`)) void onRevoke(t.id); }}>İptal et</button>}</td></tr>
            ); })}
          </tbody></table>)}
        <p className="mt-3 text-xs text-muted">Kullanım: <code>Authorization: Bearer &lt;anahtar&gt;</code> — <code>mcp</code> kapsamı <code>/api/mcp</code>, <code>webhooks</code> kapsamı <code>/api/webhooks/:provider</code> (HMAC yerine).</p></section>
    </div>
  );
}
