'use client';
import { useCallback, useEffect, useState } from 'react';
import { DEAL_STAGES, DEAL_STAGE_LABELS, HUBSPOT_MODES, HUBSPOT_MODE_LABELS, TOKEN_ADMIN_ROLES, summarizeSyncLog, type DealStage, type HubSpotImportResult, type HubSpotMode, type HubSpotPublicState, type HubSpotTestResult, type SyncLogEntry, type TeamMember } from '@jscore/contracts';
import { fmtTime } from '@/components/ui';
import { useSession } from '@/components/session';

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? 'İşlem başarısız');
  return j;
};
const DIR: Record<SyncLogEntry['direction'], string> = { push: 'JS → HubSpot', pull: 'HubSpot → JS', reconcile: 'Uzlaştırma' };

/** Senkron günlüğü (Trello kartıyla aynı görünüm; sağlayıcı etiketi parametrik). */
export function SyncLogList({ log, lastSyncAt, testId }: { log: SyncLogEntry[]; lastSyncAt: string | null; testId: string }) {
  const sum = summarizeSyncLog(log);
  return (
    <div className="mt-5" data-testid={testId}>
      <h3 className="text-sm font-bold">Senkron günlüğü</h3>
      <p className="mt-1 text-xs text-muted" role="status">Son senkron{lastSyncAt ? ` ${fmtTime(lastSyncAt)}` : ''} · {sum.changes} değişiklik · {sum.errors} hata</p>
      {log.length === 0 ? <p className="mt-2 text-sm text-muted">Henüz kayıt yok.</p> : (
        <ul className="mt-2 grid max-h-64 gap-1 overflow-auto text-xs">
          {log.slice(0, 50).map((e, i) => (
            <li key={e.id ?? i} className={`flex flex-wrap gap-x-2 ${e.ok ? '' : 'text-magenta'}`}>
              <span className="text-muted">{fmtTime(e.created_at)}</span>
              <span className="chip">{DIR[e.direction] ?? e.direction}</span>
              <span className="chip">{e.entity}</span>
              <span className="font-medium">{e.action}</span><span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** HubSpot kartı: token yalnızca sunucuya gider (maskeli görünüm döner). Bağlantı testi, aşama eşlemesi, mod, tam içe aktarma, eşitleme, günlük. */
export function HubSpotCard() {
  const { repo, me, mode, bump } = useSession();
  const demo = mode === 'demo';
  const can = !!me && TOKEN_ADMIN_ROLES.includes(me.role);
  const [st, setSt] = useState<HubSpotPublicState | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [editToken, setEditToken] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [test, setTest] = useState<HubSpotTestResult | null>(null);
  const [res, setRes] = useState<HubSpotImportResult | null>(null);

  const load = useCallback(async () => {
    if (!can || !repo || demo) return;
    try { setSt(await api<HubSpotPublicState>('/api/admin/integrations/hubspot')); setTeam(await repo.team()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'HubSpot durumu alınamadı'); }
  }, [can, demo, repo]);
  useEffect(() => { void load(); }, [load]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null); setNote(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(null); }
  };
  const connect = () => run('connect', async () => {
    const r = await api<HubSpotPublicState & { test?: HubSpotTestResult }>('/api/admin/integrations/hubspot/connect', { method: 'POST', body: JSON.stringify({ token: token.trim() }) });
    setSt(r); setToken(''); setEditToken(false); if (r.test) setTest(r.test); setNote('Token kaydedildi ve doğrulandı.'); await load(); bump();
  });
  const testConn = () => run('test', async () => { setTest(await api<HubSpotTestResult>('/api/admin/integrations/hubspot/test', { method: 'POST' })); await load(); });
  const put = (body: Record<string, unknown>) => api<HubSpotPublicState>('/api/admin/integrations/hubspot', { method: 'PUT', body: JSON.stringify(body) });
  const setMode = (m: HubSpotMode) => run('mode', async () => {
    if (m === 'off' && !window.confirm('HubSpot senkronu kapatılsın mı? Veriler ve eşlemeler korunur.')) return;
    if (m === 'two_way' && !window.confirm('İki yönlü modda JS’te yapılan müşteri / kişi / fırsat değişiklikleri HubSpot’a yazılır. Devam?')) return;
    setSt(await put({ mode: m }));
  });
  const mapStage = (key: string, stage: DealStage) => run('stage', async () => { setSt(await put({ stage_map: { [key]: stage } })); setNote('Aşama eşlemesi kaydedildi — sonraki çekimde uygulanır.'); });
  const mapOwner = (ownerId: string, emp: string) => run('owner', async () => { if (!emp) return; setSt(await put({ owner_map: { [ownerId]: emp } })); });
  const saveSecret = () => run('secret', async () => { setSt(await put({ webhook_secret: secret.trim() || null })); setSecret(''); setNote(secret.trim() ? 'Webhook sırrı kaydedildi.' : 'Webhook sırrı kaldırıldı.'); });
  const importAll = () => run('import', async () => { setRes(await api<HubSpotImportResult>('/api/admin/integrations/hubspot/import', { method: 'POST' })); await load(); bump(); });
  const reconcile = () => run('reconcile', async () => {
    const r = await api<{ pulled: number; pushed: number; created_remote: number; skipped_conflicts: number; errors: string[] }>('/api/admin/integrations/hubspot/reconcile', { method: 'POST' });
    setNote(`Eşitlendi · çekilen ${r.pulled} · itilen ${r.pushed} · HubSpot’ta yeni ${r.created_remote} · atlanan ${r.skipped_conflicts}${r.errors.length ? ` · ${r.errors.length} hata` : ''}`);
    await load(); bump();
  });
  const disconnect = () => run('disconnect', async () => {
    if (!window.confirm('HubSpot token’ı kaldırılsın mı? Eşlemeler ve içe aktarılan veriler korunur.')) return;
    setSt(await api<HubSpotPublicState>('/api/admin/integrations/hubspot', { method: 'DELETE' })); setTest(null); bump();
  });

  if (!can) return null;
  const connected = !!st?.connected;
  const sync: HubSpotMode = st?.mode ?? 'pull_only';
  const log = st?.sync_log ?? [];
  const unmappedOwners = res?.unmapped_owners ?? [];
  return (
    <section className="card mb-4" aria-labelledby="hs-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hs-h" className="font-bold">HubSpot (CRM)</h2>
        <span className={`chip ${connected ? 'chip-ok' : ''}`}>{connected ? `Bağlı · portal ${st?.portal_id}${st?.last_sync_at ? ` · son senkron ${fmtTime(st.last_sync_at)}` : ''}` : 'Bağlı değil'}</span>
      </div>
      <p className="mt-1 text-sm text-muted">Geçici köprü: HubSpot şirketleri → müşteri + marka, kişiler → müşteri kişileri, fırsatlar → pipeline. Owner’lar e-posta ile çalışana eşlenir. Çakışmada son yazan kazanır.</p>
      {demo && <p className="mt-3 text-sm text-muted">Demo modu: HubSpot yalnızca Supabase ile bağlanır (token sunucuda saklanır). Demo CRM’de iki örnek kayıt HubSpot bağlı görünür.</p>}
      {err && <p role="alert" className="mt-3 text-sm text-magenta">{err}</p>}
      {note && <p role="status" className="mt-3 text-sm text-muted">{note}</p>}
      {!demo && (!connected || editToken) && (
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
          <div><label className="label" htmlFor="hs-token">Özel uygulama token’ı</label><input id="hs-token" className="input" type="password" autoComplete="off" required minLength={20} placeholder="pat-eu1-…" value={token} onChange={(e) => setToken(e.target.value)} /></div>
          <div className="flex items-end gap-2"><button className="btn btn-primary" disabled={!!busy || token.trim().length < 20}>{busy === 'connect' ? 'Doğrulanıyor…' : connected ? 'Token’ı değiştir' : 'Bağla ve test et'}</button>{connected && <button type="button" className="btn" onClick={() => setEditToken(false)}>Vazgeç</button>}</div>
          <p className="text-xs text-muted sm:col-span-2">HubSpot → Settings → Integrations → <b>Private Apps</b> → uygulama oluştur; kapsamlar: <code>crm.objects.companies/contacts/deals.read+write</code>, <code>crm.objects.owners.read</code>, <code>crm.schemas.*.read</code>. Token yalnızca sunucuda saklanır, bir daha gösterilmez.</p>
        </form>
      )}
      {!demo && connected && (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted">Token <code>{st?.token}</code></p>
            <button className="btn btn-sm" disabled={!!busy} onClick={() => setEditToken(true)}>Token’ı değiştir</button>
            <button className="btn btn-sm" disabled={!!busy} onClick={() => void testConn()}>{busy === 'test' ? 'Test ediliyor…' : 'Bağlantıyı test et'}</button>
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void disconnect()}>Bağlantıyı kaldır</button>
          </div>
          {test && (
            <dl className="grid grid-cols-3 gap-2 text-sm" data-testid="hs-test">
              {([['Portal', test.portal_id], ['Owner', test.owners], ['Pipeline', test.pipelines.map((p) => p.label).join(', ') || '—']] as Array<[string, string | number]>).map(([l, v]) => (
                <div key={l} className="rounded-control bg-nested p-2"><dt className="text-xs text-muted">{l}</dt><dd className="font-bold">{v}</dd></div>
              ))}
            </dl>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm" htmlFor="hs-mode">Senkron modu</label>
            <select id="hs-mode" className="input w-auto" value={sync} disabled={!!busy} onChange={(e) => void setMode(e.target.value as HubSpotMode)}>
              {HUBSPOT_MODES.map((m) => <option key={m} value={m}>{HUBSPOT_MODE_LABELS[m]}</option>)}
            </select>
            <span className="text-xs text-muted">{sync === 'two_way' ? 'JS’teki müşteri / kişi / fırsat değişiklikleri HubSpot’a yazılır; çakışmada son yazan kazanır.' : sync === 'pull_only' ? 'Yalnızca HubSpot → JS; HubSpot’a yazılmaz.' : 'Senkron durdu; veriler korunuyor.'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={!!busy || sync === 'off'} onClick={() => void importAll()}>{busy === 'import' ? 'İçe aktarılıyor… (birkaç dakika sürebilir)' : 'Tam içe aktar'}</button>
            <button className="btn btn-sm" disabled={!!busy || sync === 'off'} onClick={() => void reconcile()}>{busy === 'reconcile' ? 'Eşitleniyor…' : 'Şimdi eşitle'}</button>
            {st?.counts && <span className="text-xs text-muted">Son içe aktarma: {st.counts.companies} şirket · {st.counts.contacts} kişi · {st.counts.deals} fırsat{st.owners_count != null ? ` · ${st.owners_count} owner` : ''}</span>}
          </div>
          {(st?.pipelines.length ?? 0) > 0 && (
            <fieldset data-testid="hs-stage-map"><legend className="label">Pipeline aşaması → JS fırsat aşaması</legend>
              <div className="grid gap-2 sm:grid-cols-2">{st!.pipelines.map((p) => (
                <div key={p.id} className="rounded-control bg-nested p-2">
                  <div className="mb-1 text-xs font-bold">{p.label}</div>
                  {[...p.stages].sort((a, b) => a.display_order - b.display_order).map((s) => { const k = `${p.id}:${s.id}`; return (
                    <label key={s.id} className="flex items-center justify-between gap-2 py-0.5 text-sm"><span>{s.label}</span>
                      <select className="input w-auto" aria-label={`${s.label} aşaması`} value={st!.stage_map[k] ?? ''} disabled={!!busy} onChange={(e) => void mapStage(k, e.target.value as DealStage)}>
                        <option value="">Otomatik</option>{DEAL_STAGES.map((d) => <option key={d} value={d}>{DEAL_STAGE_LABELS[d]}</option>)}
                      </select></label>
                  ); })}
                </div>
              ))}</div>
              <p className="mt-1 text-xs text-muted">“Otomatik”: kapanış aşamaları (won/lost), teklif / görüşme sözcükleri ve sıraya göre sezgisel eşleme. Geri yazımda JS aşamasına eşlenen ilk HubSpot aşaması kullanılır.</p>
            </fieldset>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium">Webhook (isteğe bağlı)</summary>
            <p className="mt-1 text-xs text-muted">HubSpot webhook aboneliği herkese açık bir uygulama gerektirir; özel uygulama token’ı ile saatlik uzlaştırma yeter. Kurulursa adres <code>/api/webhooks/hubspot?org=&lt;org&gt;</code>, doğrulama <code>X-HubSpot-Signature-v3</code> (uygulamanın client secret’ı). {st?.webhook_configured ? 'Sır tanımlı.' : 'Sır tanımlı değil.'}</p>
            <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void saveSecret(); }}>
              <input className="input w-auto min-w-64" type="password" autoComplete="off" aria-label="Webhook client secret" placeholder="client secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
              <button className="btn btn-sm" disabled={!!busy}>{secret.trim() ? 'Kaydet' : 'Kaldır'}</button>
            </form>
          </details>
        </div>
      )}
      {!demo && connected && <SyncLogList log={log} lastSyncAt={st?.last_sync_at ?? null} testId="hubspot-sync-log" />}
      {res && (
        <div className="mt-5 grid gap-3" data-testid="hubspot-result">
          <h3 className="text-sm font-bold">Sonuç</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {([['Şirket', res.companies_seen], ['Kişi', res.contacts_seen], ['Fırsat', res.deals_seen], ['Müşteri yeni/güncel', `${res.clients_created}/${res.clients_updated}`], ['Marka yeni', res.brands_created], ['Kişi yeni/güncel', `${res.contacts_created}/${res.contacts_updated}`], ['Fırsat yeni/güncel', `${res.deals_created}/${res.deals_updated}`], ['Atlanan (JS yeni)', res.skipped_conflicts]] as Array<[string, string | number]>).map(([l, v]) => (
              <div key={l} className="rounded-control bg-nested p-2"><dt className="text-xs text-muted">{l}</dt><dd className="font-bold">{v}</dd></div>
            ))}
          </dl>
          {res.errors.length > 0 && <ul className="text-sm text-magenta">{res.errors.slice(0, 20).map((x) => <li key={x}>{x}</li>)}{res.errors.length > 20 && <li>… {res.errors.length - 20} hata daha</li>}</ul>}
          {unmappedOwners.length > 0 && (
            <div><h3 className="text-sm font-bold">Eşlenemeyen owner’lar</h3>
              <p className="text-xs text-muted">E-posta ya da ad ile çalışana eşlenemedi; çalışan seç (owner id = HubSpot owner, e-posta görüntülenir).</p>
              <ul className="mt-2 grid gap-2">{unmappedOwners.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-40 font-medium">{o.label}</span>
                  <select className="input w-auto" aria-label={`${o.label} için çalışan`} value={st?.owner_map[o.id] ?? ''} disabled={!!busy} onChange={(e) => void mapOwner(o.id, e.target.value)}>
                    <option value="">Çalışan seç…</option>{team.filter((m) => m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </li>
              ))}</ul></div>
          )}
        </div>
      )}
    </section>
  );
}
