'use client';
import { useCallback, useEffect, useState } from 'react';
import { TOKEN_ADMIN_ROLES, type TeamMember, type TrelloImportResult, type TrelloPublicState } from '@jscore/contracts';
import { fmtTime } from '@/components/ui';
import { useSession } from '@/components/session';

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error ?? 'İşlem başarısız');
  return j;
};

/** Trello kartı: API anahtarı/token yalnızca sunucuya gider (maskeli görünüm döner). Demo'da örnek veriyle çalışır. */
export function TrelloCard() {
  const { repo, me, mode, bump } = useSession();
  const demo = mode === 'demo';
  const can = !!me && TOKEN_ADMIN_ROLES.includes(me.role);
  const [st, setSt] = useState<TrelloPublicState | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [key, setKey] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [res, setRes] = useState<TrelloImportResult | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!can || !repo) return;
    try {
      setSt(demo ? await repo.trelloState!() : await api<TrelloPublicState>('/api/integrations/trello?boards=1'));
      setTeam(await repo.team());
    } catch (e) { setErr(e instanceof Error ? e.message : 'Trello durumu alınamadı'); }
  }, [can, demo, repo]);
  useEffect(() => { void load(); }, [load]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null); setNote(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(null); }
  };
  const connect = () => run('connect', async () => { setSt(await api<TrelloPublicState>('/api/integrations/trello/connect', { method: 'POST', body: JSON.stringify({ api_key: key.trim(), token: token.trim() }) })); setKey(''); setToken(''); await load(); bump(); });
  const toggleBoard = (id: string, on: boolean) => run('boards', async () => {
    const cur = st?.board_ids ?? [];
    setSt(await api<TrelloPublicState>('/api/integrations/trello', { method: 'PUT', body: JSON.stringify({ board_ids: on ? [...cur, id] : cur.filter((x) => x !== id) }) }));
    await load();
  });
  const importAll = () => run('import', async () => {
    setRes(demo ? await repo!.trelloImport!() : await api<TrelloImportResult>('/api/integrations/trello/import', { method: 'POST' }));
    await load(); bump();
  });
  const hooks = () => run('hooks', async () => {
    const r = await api<{ count: number; errors: string[] }>('/api/integrations/trello/webhooks', { method: 'POST', body: JSON.stringify({ board_ids: st?.board_ids }) });
    if (r.errors.length) throw new Error(r.errors.join(' · '));
    setNote(`${r.count} pano için webhook kuruldu.`); await load();
  });
  const mapMember = (name: string, employeeId: string) => run('map', async () => {
    if (!employeeId) return;
    if (demo) await repo!.trelloSetMember!(name, employeeId);
    else await api('/api/integrations/trello', { method: 'PUT', body: JSON.stringify({ member_map: { [name]: employeeId } }) });
    setSaved((s) => ({ ...s, [name]: employeeId }));
    setNote('Eşleme kaydedildi — bir sonraki içe aktarmada uygulanır.');
  });

  if (!can) return null;
  const connected = !!st?.connected;
  const webhookN = Object.keys(st?.webhook_ids ?? {}).length;
  return (
    <section className="card mb-4" aria-labelledby="trello-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="trello-h" className="font-bold">Trello</h2>
        <span className={`chip ${connected ? 'chip-ok' : ''}`}>{connected ? `Bağlı${st?.last_sync_at ? ` · son senkron ${fmtTime(st.last_sync_at)}` : ''}` : 'Bağlı değil'}</span>
      </div>
      <p className="mt-1 text-sm text-muted">Panolar → marka · Kartlar → görev. Kişi listeleri atanan, “Onay / Teslim / Üretim / Bekleme” listeleri akış aşaması olur; şablon listeleri atlanır.</p>
      {err && <p role="alert" className="mt-3 text-sm text-magenta">{err}</p>}
      {note && <p role="status" className="mt-3 text-sm text-muted">{note}</p>}

      {demo ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void importAll()}>{busy === 'import' ? 'İçe aktarılıyor…' : connected ? 'Tam içe aktar (örnek)' : 'Örnek veriyle dene'}</button>
          <span className="text-xs text-muted">Demo modu: 10 kartlık örnek Trello verisi aynı içe aktarma çekirdeğinden geçer; anahtar gerekmez.</span>
        </div>
      ) : !connected ? (
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
          <div><label className="label" htmlFor="tr-key">API Key</label><input id="tr-key" className="input" autoComplete="off" required minLength={16} value={key} onChange={(e) => setKey(e.target.value)} /></div>
          <div><label className="label" htmlFor="tr-token">Token</label><input id="tr-token" className="input" type="password" autoComplete="off" required minLength={20} value={token} onChange={(e) => setToken(e.target.value)} /></div>
          <p className="text-xs text-muted sm:col-span-2">Anahtarı almak için: <code>trello.com/power-ups/admin</code> → Power-Up oluştur/seç → <b>API key</b> → <b>“Token”</b> bağlantısı (read yetkisi yeterli). Değerler yalnızca sunucuda saklanır, bir daha gösterilmez.</p>
          <button className="btn btn-primary w-fit" disabled={!!busy || key.trim().length < 16 || token.trim().length < 20}>{busy === 'connect' ? 'Doğrulanıyor…' : 'Bağla'}</button>
        </form>
      ) : (
        <div className="mt-4 grid gap-4">
          <p className="text-xs text-muted">{st?.member_name && <>{st.member_name} · </>}Key <code>{st?.api_key}</code> · Token <code>{st?.token}</code></p>
          <fieldset><legend className="label">Panolar {st?.board_ids.length ? '' : '(seçilmezse tümü)'}</legend>
            <div className="flex flex-wrap gap-3">{(st?.boards ?? []).map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!!busy} checked={st!.board_ids.includes(b.id)} onChange={(e) => void toggleBoard(b.id, e.target.checked)} /> {b.name}</label>
            ))}{!st?.boards.length && <span className="text-sm text-muted">Pano listesi alınamadı.</span>}</div></fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => void importAll()}>{busy === 'import' ? 'İçe aktarılıyor… (birkaç dakika sürebilir)' : 'Tam içe aktar'}</button>
            <button className="btn btn-sm" disabled={!!busy || !st?.board_ids.length} onClick={() => void hooks()}>{busy === 'hooks' ? 'Kuruluyor…' : 'Webhook kur'}</button>
            <span className="text-xs text-muted">{webhookN ? `${webhookN} pano webhook’lu` : 'Webhook yok'}{!st?.board_ids.length && ' · webhook için pano seç'}</span>
          </div>
        </div>
      )}

      {res && (
        <div className="mt-5 grid gap-3" data-testid="trello-result">
          <h3 className="text-sm font-bold">Sonuç</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {([['Pano', res.boards], ['Liste', res.lists], ['Kart', res.cards_seen], ['Şablon (atlandı)', res.skipped_templates], ['Proje yeni/mevcut', `${res.projects_created}/${res.projects_updated}`], ['Görev yeni', res.tasks_created], ['Görev güncel', res.tasks_updated], ['Görev değişmedi', res.tasks_unchanged]] as Array<[string, string | number]>).map(([l, v]) => (
              <div key={l} className="rounded-control bg-nested p-2"><dt className="text-xs text-muted">{l}</dt><dd className="font-bold">{v}</dd></div>
            ))}
          </dl>
          {res.brands_created.length > 0 && <p className="text-sm">Yeni marka (aday): {res.brands_created.map((b) => <span key={b} className="chip mr-1">{b}</span>)}</p>}
          {res.errors.length > 0 && <ul className="text-sm text-magenta">{res.errors.map((x) => <li key={x}>{x}</li>)}</ul>}
          {res.unmapped_members.length > 0 && (
            <div><h3 className="text-sm font-bold">Eşlenemeyen kişiler</h3>
              <ul className="mt-2 grid gap-2">{res.unmapped_members.map((u) => (
                <li key={u.name} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-40 font-medium">{u.name}</span><span className="text-xs text-muted">{u.cards} kart</span>
                  <select className="input w-auto" aria-label={`${u.name} için çalışan`} value={saved[u.name] ?? ''} disabled={!!busy} onChange={(e) => void mapMember(u.name, e.target.value)}>
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
