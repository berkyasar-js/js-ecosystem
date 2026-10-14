'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SOCIAL_STATUS, canDecideApproval, type MediaAsset, type SocialPost } from '@jscore/contracts';
import { Empty, fmtDate, fmtTime, todayFor, useData } from '../ui';
import { useSession } from '../session';
import { Await, Bar, Card, Chip, Crud, FormCard, Grid, Metric, ModulePage, Table, brandName, nameOf, tl, toneOf, useAct, useCan, useWorld } from '../mod';
import { Funnel } from '../charts';
import { addDays, fmtTimecode, parseTimecode } from '@/lib/domain';
import { buildPdf } from '@/lib/pdf';
import { agentRunBody } from '@/lib/agents/client';

const gb = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);
const brandOpts = (b: Array<{ id: string; name: string }>): Array<[string, string]> => b.map((x) => [x.id, x.name]);

/* ───────── MEDIA ───────── */
export function MediaView({ tab }: { tab?: string }) {
  const { repo } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['media_assets']); const [kind, setKind] = useState('');
  return (
    <ModulePage id="media" title="JS Media" sub="Medya kütüphanesi, depolama ve taşıma" tabs={[['library', 'Media library'], ['storage', 'Storage & Migration']]} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const write = can.write('media_assets');
        if (t === 'library') {
          const list = d.media_assets.filter((m) => !kind || m.kind === kind);
          return (
            <div className="grid gap-4">{Err}
              <div className="flex items-center gap-2"><label className="label m-0" htmlFor="mk">Tür</label><select id="mk" className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tümü</option>{['video', 'image', 'doc', 'audio'].map((k) => <option key={k}>{k}</option>)}</select></div>
              {list.length === 0 ? <Empty>Dosya yok.</Empty> : <Grid cols={3}>{list.map((m) => (
                <Card key={m.id} title={m.name} aside={<Chip>{m.kind}</Chip>}>
                  <p className="text-xs text-muted">{brandName(d.brands, m.brand_id)} · v{m.version} · {gb(m.size_mb)} · {m.storage}</p><p className="mt-1 text-xs text-muted">Saklama: {fmtDate(m.retention_until)}</p>
                  <div className="mt-3 flex flex-wrap gap-2"><Chip tone={m.client_visible ? 'ok' : undefined}>{m.client_visible ? 'Müşteriyle paylaşıldı' : 'İç'}</Chip>{write && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('media_assets', { id: m.id, client_visible: !m.client_visible }))}>{m.client_visible ? 'Paylaşımı kaldır' : 'Müşteriyle paylaş'}</button>}</div>
                </Card>))}</Grid>}
              {write && <FormCard title="Dosya kaydı ekle" busy={busy} fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'brand', label: 'Marka', type: 'select', options: brandOpts(d.brands) }, { name: 'kind', label: 'Tür', type: 'select', options: [['video', 'Video'], ['image', 'Görsel'], ['doc', 'Belge'], ['audio', 'Ses']] }, { name: 'size', label: 'Boyut (MB)', type: 'number', def: 50 }]}
                onSubmit={(v) => act(() => repo!.save('media_assets', { brand_id: String(v.brand), project_id: null, name: String(v.name), kind: String(v.kind) as 'video', size_mb: Number(v.size), storage: 'minio', status: 'ok', retention_until: '2027-10-14', client_visible: false, version: 1, versions: [{ v: 1, at: '2026-10-14', note: 'İlk yükleme' }], duration_s: 0 }))} />}
            </div>
          );
        }
        const stores = ['minio', 'vimeo', 's3'] as const; const QUOTA = 50000;
        const total = d.media_assets.reduce((s, m) => s + m.size_mb, 0);
        return (
          <div className="grid gap-4">{Err}
            <Card title="Depolama kullanımı" aside={<Chip tone={toneOf((total / QUOTA) * 100) === 'ok' ? 'ok' : 'warn'}>{gb(total)} / {gb(QUOTA)}</Chip>}>
              <Bar pct={(total / QUOTA) * 100} tone={toneOf((total / QUOTA) * 100)} />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">{stores.map((s) => <div key={s} className="nested text-sm"><strong>{s === 'minio' ? 'MinIO' : s === 'vimeo' ? 'Vimeo' : 'S3 (soğuk)'}</strong><div className="text-muted">{gb(d.media_assets.filter((m) => m.storage === s).reduce((a, m) => a + m.size_mb, 0))} · {d.media_assets.filter((m) => m.storage === s).length} dosya</div></div>)}</div>
            </Card>
            <Card title="Taşıma (migration)">
              <Table heads={['Dosya', 'Konum', 'Boyut', 'Durum', '']}>{d.media_assets.map((m: MediaAsset) => <tr key={m.id}><td>{m.name}</td><td>{m.storage}</td><td>{gb(m.size_mb)}</td><td><Chip tone={m.status === 'ok' ? 'ok' : 'warn'}>{m.status}</Chip></td>
                <td className="whitespace-nowrap">{write && stores.filter((s) => s !== m.storage).map((s) => <button key={s} className="btn btn-sm mr-1" disabled={busy} onClick={() => void act(async () => { await repo!.save('media_assets', { id: m.id, status: 'migrating' }); await repo!.save('media_assets', { id: m.id, storage: s, status: 'ok' }); })}>→ {s}</button>)}</td></tr>)}</Table>
              <p className="mt-2 text-xs text-muted">Taşıma simüle edilir; üretimde arka plan işi + kontrol toplamı doğrulaması çalışır.</p>
            </Card>
            <Card title="Saklama süresi dolacaklar (90 gün)">{d.media_assets.filter((m) => m.retention_until < addDays('2026-10-14', 400)).length === 0 ? <Empty>Yok.</Empty> : <ul className="text-sm">{d.media_assets.map((m) => <li key={m.id}>{m.name} — {fmtDate(m.retention_until)}</li>)}</ul>}</Card>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── REVIEW ───────── */
export function ReviewView({ tab }: { tab?: string }) {
  const { repo, me, mode } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['media_assets', 'review_comments', 'share_links']); const ap = useData((r) => r.listApprovals());
  const [sel, setSel] = useState(''); const [ver, setVer] = useState(0); const [t, setT] = useState(0); const [play, setPlay] = useState(false); const [tc, setTc] = useState('');
  const today = todayFor(mode);
  useEffect(() => { if (!play) return; const i = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(i); }, [play]);
  const write = can.write('review_comments') || me?.role === 'client_admin' || me?.role === 'client_viewer';
  return (
    <ModulePage id="review" title="JS Review" sub="Zaman kodlu yorum, sürümler ve onay kuyruğu" tabs={[['player', 'Review player'], ['queue', 'Onay kuyruğu']]} tab={tab}>
      {(tabId) => <Await q={q}>{(d) => {
        const videos = d.media_assets.filter((m) => m.kind === 'video' || m.kind === 'image');
        const asset = videos.find((v) => v.id === sel) ?? videos[0];
        if (tabId === 'queue') {
          const items = (ap.data ?? []).filter((a) => a.action_type === 'content' || a.action_type === 'client_decision');
          return <div className="grid gap-3">{Err}{items.length === 0 ? <Empty>Onay kuyruğu boş.</Empty> : items.map((a) => (
            <div key={a.id} className="card flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><strong className="text-sm">{a.title}</strong><div className="text-xs text-muted">{a.subject.version ?? ''} · son tarih {fmtDate(a.due_at)} · {a.required_role}</div></div>
              <Chip tone={a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'bad' : 'warn'}>{a.status}</Chip>
              {a.status === 'pending' && me && canDecideApproval(me.role, a.required_role) && <><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideApproval(a.id, 'approved'))}>Onayla</button><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideApproval(a.id, 'rejected', 'Revize gerekli'))}>Revize</button></>}</div>))}</div>;
        }
        if (!asset) return <Empty>İncelenecek medya yok.</Empty>;
        const v = ver || asset.version; const dur = asset.duration_s || 60; const now = Math.min(t, dur);
        const comments = d.review_comments.filter((c) => c.asset_id === asset.id && c.version === v).sort((a, b) => a.timecode_s - b.timecode_s);
        const link = d.share_links.find((l) => l.asset_ids.includes(asset.id) && l.status === 'active');
        return (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="grid content-start gap-4">{Err}
              <div className="flex flex-wrap gap-2"><select className="input w-auto" aria-label="Dosya" value={asset.id} onChange={(e) => { setSel(e.target.value); setVer(0); setT(0); setPlay(false); }}>{videos.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                <select className="input w-auto" aria-label="Sürüm" value={v} onChange={(e) => setVer(Number(e.target.value))}>{asset.versions.map((x) => <option key={x.v} value={x.v}>v{x.v} · {x.note}</option>)}</select></div>
              <Card title={asset.name}>
                <div className="relative grid aspect-video place-items-center rounded-2xl bg-nested text-sm text-muted" role="img" aria-label="Video oynatıcı (demo)"><span className="text-4xl font-bold tabular-nums text-ink">{fmtTimecode(now)}</span><span>/ {fmtTimecode(dur)} · demo oynatıcı</span></div>
                <div className="relative mt-3"><input type="range" min={0} max={dur} value={now} onChange={(e) => setT(Number(e.target.value))} className="w-full" aria-label="Zaman çubuğu" />
                  <div className="pointer-events-none relative h-2">{comments.map((c) => <span key={c.id} className="absolute top-0 h-2 w-1.5 rounded bg-accent" style={{ left: `${(c.timecode_s / dur) * 100}%` }} />)}</div></div>
                <div className="mt-2 flex gap-2"><button className="btn btn-sm" onClick={() => setPlay((p) => !p)} aria-pressed={play}>{play ? 'Duraklat' : 'Oynat'}</button>
                  {can.write('media_assets') && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('media_assets', { id: asset.id, version: asset.version + 1, versions: [...asset.versions, { v: asset.version + 1, at: today, note: 'Revize' }] }))}>Yeni sürüm yükle (simüle)</button>}</div>
              </Card>
              <Card title="Harici izleme bağlantısı">{link ? <p className="text-sm">Müşteri linki: <Link className="underline" href={`/watch/${link.token}`} target="_blank">/watch/{link.token}</Link> · son {fmtDate(link.expires_at)}</p> : <p className="text-sm text-muted">Aktif bağlantı yok. JS Transfer → Links ile oluştur.</p>}</Card>
            </div>
            <Card title={`Yorumlar · v${v}`}>
              <ul className="grid gap-2" aria-live="polite">{comments.length === 0 && <li className="text-sm text-muted">Bu sürümde yorum yok.</li>}{comments.map((c) => (
                <li key={c.id} className={`nested text-sm ${c.resolved ? 'opacity-60' : ''}`}><button className="mr-2 font-mono text-xs underline" onClick={() => setT(c.timecode_s)}>{fmtTimecode(c.timecode_s)}</button><strong>{c.author}</strong>{!c.client_visible && <Chip>iç</Chip>}<div>{c.body}</div>
                  {can.write('review_comments') && <button className="btn btn-ghost btn-sm mt-1" onClick={() => void act(() => repo!.save('review_comments', { id: c.id, resolved: !c.resolved }))}>{c.resolved ? 'Yeniden aç' : 'Çözüldü'}</button>}</li>))}</ul>
              {write && <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const body = String(f.get('body')).trim(); if (!body) return; void act(() => repo!.save('review_comments', { asset_id: asset.id, version: v, timecode_s: tc ? parseTimecode(tc) : now, author: me?.name ?? '', body, resolved: false, client_visible: f.get('cv') === 'on' || !can.write('review_comments'), brand_id: asset.brand_id }).then(() => setTc(''))); e.currentTarget.reset(); }}>
                <div className="flex gap-2"><label className="sr-only" htmlFor="tc">Zaman kodu</label><input id="tc" className="input w-24 font-mono" placeholder={fmtTimecode(now)} value={tc} onChange={(e) => setTc(e.target.value)} /><input name="body" className="input" aria-label="Yorum" placeholder="Bu andaki yorum…" required /></div>
                {can.write('review_comments') && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="cv" defaultChecked /> Müşteri görsün</label>}<button className="btn btn-primary btn-sm" disabled={busy}>Yorum ekle ({tc || fmtTimecode(now)})</button></form>}
            </Card>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── TRANSFER ───────── */
export function TransferView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['transfers', 'share_links', 'media_assets']); const audit = useData((r) => r.listAudit().catch(() => []));
  const [sim, setSim] = useState<Record<string, number>>({}); const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => clearInterval(t)), []);
  const today = todayFor(mode);
  const startUpload = async (files: File[]) => {
    for (const f of files) {
      const mb = Math.max(1, Math.round(f.size / 1e6));
      const rec = await repo!.save('transfers', { name: f.name, size_mb: mb, progress: 0, status: 'uploading' });
      setSim((s) => ({ ...s, [rec.id]: 0 }));
      const id = window.setInterval(() => setSim((s) => {
        const next = Math.min(100, (s[rec.id] ?? 0) + 8 + Math.round(Math.random() * 12));
        if (next >= 100) { clearInterval(id); void repo!.save('transfers', { id: rec.id, progress: 100, status: 'done' }).then(() => undefined); }
        return { ...s, [rec.id]: next };
      }), 400);
      timers.current.push(id);
    }
  };
  const tabs: Array<[string, string]> = [['uploads', 'Uploads'], ['links', 'Paylaşım linkleri'], ['audit', 'Audit'], ['quota', 'Kota']];
  return (
    <ModulePage id="transfer" title="JS Transfer" sub="Yükleme, süreli paylaşım linki ve indirme logu" tabs={tabs} tab={tab}>
      {(tabId) => <Await q={q}>{(d) => {
        const write = can.write('transfers');
        if (tabId === 'uploads') return (
          <div className="grid gap-4">{Err}
            {write && <Card title="Dosya yükle (simüle)"><label className="label" htmlFor="up">Dosya seç (gerçek yükleme yapılmaz; ilerleme simüle edilir)</label><input id="up" type="file" multiple className="input" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void startUpload(fs); e.target.value = ''; }} /></Card>}
            <Card title="Yüklemeler">{d.transfers.length === 0 ? <Empty>Yükleme yok.</Empty> : <ul className="grid gap-2">{d.transfers.map((tr) => { const p = sim[tr.id] ?? tr.progress; return <li key={tr.id} className="nested"><div className="flex justify-between text-sm"><span>{tr.name}</span><span>{gb(tr.size_mb)} · {p}%</span></div><Bar pct={p} tone={p >= 100 ? 'ok' : undefined} /></li>; })}</ul>}</Card>
          </div>
        );
        if (tabId === 'links') return (
          <div className="grid gap-4">{Err}
            <Card title="Paylaşım linkleri">{d.share_links.length === 0 ? <Empty>Link yok.</Empty> : <Table heads={['Link', 'Dosya', 'Son tarih', 'İndirme', 'Durum', '']}>{d.share_links.map((l) => { const expired = l.expires_at < today; const st = l.status === 'revoked' ? 'revoked' : expired || l.downloads >= l.max_downloads ? 'expired' : 'active'; return (
              <tr key={l.id}><td><Link className="underline" href={`/watch/${l.token}`} target="_blank">/watch/{l.token}</Link>{l.password && <Chip>şifreli</Chip>}</td><td className="text-muted">{l.asset_ids.map((a) => d.media_assets.find((m) => m.id === a)?.name).join(', ')}</td><td>{fmtDate(l.expires_at)}</td><td>{l.downloads}/{l.max_downloads}</td><td><Chip tone={st === 'active' ? 'ok' : 'bad'}>{st}</Chip></td><td>{write && st === 'active' && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('share_links', { id: l.id, status: 'revoked' }))}>İptal et</button>}</td></tr>); })}</Table>}</Card>
            {write && <FormCard title="Yeni süreli link" busy={busy} fields={[{ name: 'asset', label: 'Dosya', type: 'select', options: d.media_assets.map((m) => [m.id, m.name]) }, { name: 'days', label: 'Geçerlilik (gün)', type: 'number', def: 7 }, { name: 'max', label: 'Maks. indirme', type: 'number', def: 10 }, { name: 'pw', label: 'Şifre koru', type: 'checkbox' }]}
              onSubmit={(v) => act(() => { const a = d.media_assets.find((m) => m.id === v.asset); return repo!.save('share_links', { brand_id: a?.brand_id ?? null, asset_ids: [String(v.asset)], token: Math.random().toString(36).slice(2, 8), expires_at: addDays(today, Number(v.days)), password: !!v.pw, downloads: 0, max_downloads: Number(v.max), status: 'active', client_visible: true }); })} />}
          </div>
        );
        if (tabId === 'audit') return (
          <div className="grid gap-4">
            <Card title="İndirme sayaçları"><Table heads={['Link', 'İndirme']}>{d.share_links.map((l) => <tr key={l.id}><td>{l.token}</td><td>{l.downloads}</td></tr>)}</Table></Card>
            <Card title="Denetim kaydı (transfer / link)">{audit.data && audit.data.filter((e) => /share_links|transfers/.test(e.resource)).length ? <Table heads={['Zaman', 'Kim', 'İşlem']}>{audit.data.filter((e) => /share_links|transfers/.test(e.resource)).slice(0, 12).map((e) => <tr key={e.id}><td>{fmtTime(e.occurred_at)}</td><td>{e.actor_name}</td><td>{e.action}</td></tr>)}</Table> : <Empty>Kayıt yok (veya bu rol denetim kaydını göremez).</Empty>}</Card>
          </div>
        );
        const QUOTA = 100000; const used = d.transfers.reduce((s, x) => s + x.size_mb, 0) + d.media_assets.reduce((s, x) => s + x.size_mb, 0);
        return <Card title="Aylık transfer kotası"><div className="flex justify-between text-sm"><span>{gb(used)} kullanıldı</span><span>{gb(QUOTA)} kota</span></div><Bar pct={(used / QUOTA) * 100} tone={toneOf((used / QUOTA) * 100)} /><p className="mt-2 text-xs text-muted">Kota dolunca yeni link/yükleme engellenir; Marketplace → Kullanım üzerinden artırılır.</p></Card>;
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── STUDIO ───────── */
export function StudioView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['studio_items']); const [brand, setBrand] = useState(''); const [goal, setGoal] = useState('bilinirlik');
  const [res, setRes] = useState<{ summary: string; concepts: Array<{ title: string; idea: string; tone: string }> } | null>(null); const [aiErr, setAiErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const today = todayFor(mode); const write = can.write('studio_items');
  return (
    <ModulePage id="studio" title="JS Studio" sub="Brand Memory, brief ve AI taslak" tabs={[['memory', 'Brand Memory'], ['brief', 'Brief Builder'], ['composer', 'AI Composer']]} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const b = brand || d.brands[0]?.id || ''; const memory = d.studio_items.find((x) => x.kind === 'memory' && x.brand_id === b);
        const brandSel = <div className="mb-4 flex items-center gap-2"><label className="label m-0" htmlFor="sb">Marka</label><select id="sb" className="input w-auto" value={b} onChange={(e) => setBrand(e.target.value)}>{d.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>;
        if (t === 'memory') return (
          <div>{brandSel}{Err}<Card title="Brand Memory" aside={d.brands.find((x) => x.id === b)?.compliance_flags.map((f) => <Chip key={f} tone="warn">{f}</Chip>)}>
            <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const forbidden = String(f.get('forbidden')).split(',').map((x) => x.trim()).filter(Boolean); void act(() => memory ? repo!.save('studio_items', { id: memory.id, body: String(f.get('body')), data: { ...memory.data, forbidden } }) : repo!.save('studio_items', { kind: 'memory', brand_id: b, title: `${d.brands.find((x) => x.id === b)?.name} Brand Memory`, body: String(f.get('body')), data: { forbidden } })); }}>
              <div><label className="label" htmlFor="mb">Ton, renk, kurallar</label><textarea id="mb" name="body" className="input min-h-32" key={memory?.id ?? b} defaultValue={memory?.body ?? ''} disabled={!write} /></div>
              <div><label className="label" htmlFor="mf">Yasaklı ifadeler (virgülle)</label><input id="mf" name="forbidden" className="input" key={`f${memory?.id ?? b}`} defaultValue={((memory?.data.forbidden as string[] | undefined) ?? []).join(', ')} disabled={!write} /></div>
              {write && <div><button className="btn btn-primary btn-sm" disabled={busy}>Kaydet</button></div>}</form></Card></div>
        );
        if (t === 'brief') {
          const briefs = d.studio_items.filter((x) => x.kind === 'brief' && (!b || x.brand_id === b));
          return (
            <div className="grid gap-4">{brandSel}{Err}
              <Card title="Briefler">{briefs.length === 0 ? <Empty>Bu marka için brief yok.</Empty> : briefs.map((x) => <div key={x.id} className="nested mb-2 text-sm"><strong>{x.title}</strong><p className="text-muted">{x.body}</p></div>)}</Card>
              {write && <FormCard title="Brief Builder (5 unsur)" busy={busy} fields={[{ name: 'title', label: 'Başlık', required: true, wide: true }, { name: 'goal', label: 'Hedef', required: true }, { name: 'aud', label: 'Kitle', required: true }, { name: 'out', label: 'Çıktı', required: true }, { name: 'msg', label: 'Mesaj / ton', required: true }, { name: 'date', label: 'Tarih', type: 'date', def: addDays(today, 14) }]}
                onSubmit={(v) => act(() => repo!.save('studio_items', { kind: 'brief', brand_id: b, title: String(v.title), body: `Hedef: ${v.goal}. Kitle: ${v.aud}. Çıktı: ${v.out}. Mesaj: ${v.msg}. Tarih: ${fmtDate(String(v.date))}.`, data: {} }))} />}
            </div>
          );
        }
        const run = async () => {
          setLoading(true); setAiErr(null); setRes(null);
          try {
            const r = await fetch('/api/agents/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await agentRunBody(repo, todayFor(mode), { agent: 'studio_draft', input: { brand: d.brands.find((x) => x.id === b)?.name, goal, memory: memory?.body ?? '', brief: d.studio_items.find((x) => x.kind === 'brief' && x.brand_id === b)?.body ?? '' } })) });
            const j = await r.json() as { output?: typeof res; error?: string };
            if (!r.ok || !j.output) throw new Error(j.error ?? 'Taslak üretilemedi');
            setRes(j.output); await repo!.audit('studio.draft_generated', `brands/${b}`, { mode: r.headers.get('x-mode') ?? 'demo' });
          } catch (e) { setAiErr(e instanceof Error ? e.message : 'Hata'); } finally { setLoading(false); }
        };
        const forbidden = (memory?.data.forbidden as string[] | undefined) ?? [];
        return (
          <div className="grid gap-4">{brandSel}{Err}
            <Card title="AI Composer"><div className="flex flex-wrap items-end gap-3"><div><label className="label" htmlFor="gl">Hedef</label><input id="gl" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} /></div><button className="btn btn-primary" onClick={() => void run()} disabled={loading}>{loading ? 'Üretiliyor…' : 'Konsept taslağı üret'}</button></div>
              <p className="mt-2 text-xs text-muted">Brand Memory ve son brief bağlama eklenir. Demo / anahtarsız modda yanıt deterministiktir; taslaklar onay akışından geçmeden yayınlanmaz.</p></Card>
            {aiErr && <p role="alert" className="text-sm text-magenta">{aiErr}</p>}
            {res && <Card title="Taslaklar"><p className="mb-3 text-sm text-muted">{res.summary}</p><div className="grid gap-3 sm:grid-cols-3">{res.concepts.map((c) => { const hit = forbidden.filter((w) => `${c.title} ${c.idea}`.toLocaleLowerCase('tr').includes(w.toLocaleLowerCase('tr'))); return (
              <div key={c.title} className="nested"><strong className="text-sm">{c.title}</strong><p className="mt-1 text-sm">{c.idea}</p><div className="mt-2 flex flex-wrap gap-1"><Chip>{c.tone}</Chip>{hit.length > 0 && <Chip tone="bad">yasaklı: {hit.join(', ')}</Chip>}</div>
                {write && <button className="btn btn-sm mt-2" disabled={busy || hit.length > 0} onClick={() => void act(() => repo!.save('studio_items', { kind: 'draft', brand_id: b, title: c.title, body: c.idea, data: { tone: c.tone } }))}>Taslak olarak kaydet</button>}</div>); })}</div></Card>}
            <Card title="Kayıtlı taslaklar">{d.studio_items.filter((x) => x.kind === 'draft' && x.brand_id === b).length === 0 ? <Empty>Kayıtlı taslak yok.</Empty> : d.studio_items.filter((x) => x.kind === 'draft' && x.brand_id === b).map((x) => <p key={x.id} className="text-sm"><strong>{x.title}</strong> — {x.body}</p>)}</Card>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── SOCIAL ───────── */
export function SocialView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['social_posts']); const [brand, setBrand] = useState('');
  const today = todayFor(mode); const write = can.write('social_posts');
  return (
    <ModulePage id="social" title="JS Social" sub="İçerik takvimi ve onay kuyruğu" tabs={[['calendar', 'Content calendar'], ['queue', 'Onay kuyruğu']]} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const b = brand || d.brands.find((x) => d.social_posts.some((p) => p.brand_id === x.id))?.id || d.brands[0]?.id || ''; const posts = d.social_posts.filter((p) => p.brand_id === b);
        const sel = <div className="mb-4 flex items-center gap-2"><label className="label m-0" htmlFor="sbr">Marka</label><select id="sbr" className="input w-auto" value={b} onChange={(e) => setBrand(e.target.value)}>{d.brands.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>;
        if (t === 'queue') {
          const rev = d.social_posts.filter((p) => p.status === 'review');
          return <div className="grid gap-3">{Err}{rev.length === 0 ? <Empty>Onay bekleyen içerik yok.</Empty> : rev.map((p) => <div key={p.id} className="card flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1 text-sm"><strong>{brandName(d.brands, p.brand_id)}</strong> · {fmtDate(p.date)} · {p.channel} {p.format}<div className="text-muted">{p.copy}</div></div>{write && <><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('social_posts', { id: p.id, status: 'approved' }))}>Onayla</button><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('social_posts', { id: p.id, status: 'draft' }))}>Taslağa dön</button></>}</div>)}</div>;
        }
        const m = '2026-10'; const first = new Date(`${m}-01T12:00:00Z`); const offset = (first.getUTCDay() + 6) % 7; const days = new Date(Date.UTC(2026, 10, 0)).getUTCDate();
        const cells = Array.from({ length: offset + days }, (_, i) => (i < offset ? null : i - offset + 1));
        const quota = d.brands.find((x) => x.id === b)?.monthly_quota.social_visual; const used = posts.filter((p) => p.format === 'Post' && p.date.startsWith(m)).length;
        return (
          <div className="grid gap-4">{sel}{Err}
            <Card title="Ekim 2026" aside={quota ? <Chip tone={used > quota ? 'bad' : 'ok'}>Kota {used}/{quota} post</Chip> : undefined}>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-muted max-[720px]:hidden">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((x) => <div key={x}>{x}</div>)}</div>
              <div className="grid grid-cols-7 gap-1 max-[720px]:grid-cols-1">{cells.map((n, i) => n === null ? <div key={i} className="max-[720px]:hidden" /> : (
                <div key={i} className={`min-h-16 rounded-xl border p-1.5 text-xs ${`${m}-${String(n).padStart(2, '0')}` === today ? 'border-accent' : 'border-line'}`}><div className="text-muted">{n}</div>{posts.filter((p) => p.date === `${m}-${String(n).padStart(2, '0')}`).map((p) => <div key={p.id} className="mt-1"><Chip tone={p.status === 'approved' || p.status === 'published' || p.status === 'scheduled' ? 'ok' : p.status === 'review' ? 'warn' : undefined}>{p.format} · {p.status}</Chip></div>)}</div>))}</div>
            </Card>
            <Card title="Pipeline"><Funnel steps={SOCIAL_STATUS.map((s) => [s, posts.filter((p) => p.status === s).length])} /></Card>
            {write && <FormCard title="Yeni gönderi" busy={busy} fields={[{ name: 'date', label: 'Tarih', type: 'date', def: today, required: true }, { name: 'channel', label: 'Kanal', type: 'select', options: [['Instagram', 'Instagram'], ['LinkedIn', 'LinkedIn'], ['X', 'X']] }, { name: 'format', label: 'Format', type: 'select', options: [['Post', 'Post'], ['Reels', 'Reels'], ['Story', 'Story']] }, { name: 'copy', label: 'Metin', type: 'textarea', required: true }]}
              onSubmit={(v) => act(() => repo!.save('social_posts', { brand_id: b, date: String(v.date), channel: String(v.channel), format: String(v.format), copy: String(v.copy), status: 'draft', client_visible: true } as Omit<SocialPost, 'id' | 'org_id' | 'created_at'>))} />}
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── PRESENT ───────── */
export function PresentView({ tab }: { tab?: string }) {
  const { repo } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['decks']); const [deck, setDeck] = useState(''); const write = can.write('decks');
  const exportPdf = (title: string, slides: number, brand: string) => {
    const { bytes } = buildPdf({ title, subtitle: brand, meta: [['Slayt sayısı', String(slides)], ['Durum', 'Taslak']], blocks: [{ t: 'h2', text: 'Taslak akışı' }, ...Array.from({ length: Math.min(slides, 14) }, (_, i) => ({ t: 'p' as const, text: `Slayt ${i + 1}: ${['Kapak', 'Gündem', 'Durum özeti', 'Hedefler', 'Yaklaşım', 'Kapsam', 'Zaman çizelgesi', 'Ekip', 'Bütçe', 'Referanslar', 'Riskler', 'Sonraki adımlar', 'Sorular', 'Kapanış'][i]}` }))], footer: title });
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/\s+/g, '-')}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  return (
    <ModulePage id="present" title="JS Present" sub="Sunum kütüphanesi, şablonlar ve PDF dışa aktarım" tabs={[['library', 'Library'], ['templates', 'Templates'], ['export', 'Export PDF']]} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const decks = d.decks.filter((x) => !x.template); const tpls = d.decks.filter((x) => x.template);
        if (t === 'library') return <Crud kind="decks" title="Sunum" rows={decks} canEdit={write} empty="Sunum yok." heads={['Başlık', 'Marka', 'Slayt', 'Durum']} cells={(r) => [<strong key="t">{r.title}</strong>, brandName(d.brands, r.brand_id), r.slides, <Chip key="s" tone={r.status === 'final' ? 'ok' : 'warn'}>{r.status}</Chip>]}
          fields={[{ name: 'title', label: 'Başlık', required: true }, { name: 'brand', label: 'Marka', type: 'select', options: [['', '—'], ...brandOpts(d.brands)] }, { name: 'slides', label: 'Slayt', type: 'number', def: 10 }]} build={(v) => ({ title: String(v.title), brand_id: v.brand ? String(v.brand) : null, template: false, slides: Number(v.slides), status: 'draft' as const })} />;
        if (t === 'templates') return <div className="grid gap-4">{Err}<Grid cols={3}>{tpls.map((x) => <Card key={x.id} title={x.title}><p className="text-sm text-muted">{x.slides} slayt</p>{write && <button className="btn btn-sm mt-3" disabled={busy} onClick={() => void act(() => repo!.save('decks', { title: `${x.title} (kopya)`, brand_id: null, template: false, slides: x.slides, status: 'draft' }))}>Şablondan oluştur</button>}</Card>)}</Grid></div>;
        const cur = d.decks.find((x) => x.id === deck) ?? decks[0];
        return <Card title="PDF dışa aktar">{!cur ? <Empty>Sunum yok.</Empty> : <div className="flex flex-wrap items-end gap-3"><div><label className="label" htmlFor="dk">Sunum</label><select id="dk" className="input" value={cur.id} onChange={(e) => setDeck(e.target.value)}>{d.decks.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div><button className="btn btn-primary" onClick={() => exportPdf(cur.title, cur.slides, brandName(d.brands, cur.brand_id))}>PDF indir</button></div>}<p className="mt-3 text-xs text-muted">Dışa aktarım bağımsız PDF yazıcıyla (pdf.ts) üretilir; slayt akışı özeti içerir.</p></Card>;
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── MARKETING ───────── */
export function MarketingView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession(); const can = useCan(); const { act, busy } = useAct();
  const q = useWorld(['campaigns', 'mkt_leads', 'segments', 'newsletters']); const write = can.write('campaigns'); const today = todayFor(mode);
  const tabs: Array<[string, string]> = [['campaigns', 'Kampanyalar'], ['leads', 'Leads'], ['segments', 'Segmentler'], ['funnel', 'Funnel'], ['newsletter', 'Newsletter']];
  return (
    <ModulePage id="marketing" title="JS Marketing" sub="Kampanya, lead, segment, huni ve bülten" tabs={tabs} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        if (t === 'campaigns') return <Crud kind="campaigns" title="Kampanya" rows={d.campaigns} canEdit={write} empty="Kampanya yok." heads={['Ad', 'Kanal', 'Bütçe', 'Harcama', 'Lead', 'Durum']} cells={(r) => [<strong key="n">{r.name}</strong>, r.channel, tl(r.budget_minor), <span key="s">{tl(r.spend_minor)} <Bar pct={r.budget_minor ? (r.spend_minor / r.budget_minor) * 100 : 0} tone={toneOf((r.spend_minor / Math.max(1, r.budget_minor)) * 100)} /></span>, r.leads, <Chip key="st" tone={r.status === 'running' ? 'ok' : undefined}>{r.status}</Chip>]}
          fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'channel', label: 'Kanal', def: 'LinkedIn' }, { name: 'budget', label: 'Bütçe (₺)', type: 'number', def: 10000 }]} build={(v) => ({ name: String(v.name), brand_id: null, channel: String(v.channel), budget_minor: Math.round(Number(v.budget) * 100), spend_minor: 0, leads: 0, status: 'planned' as const, start: today, end: addDays(today, 30) })} />;
        if (t === 'leads') return <Crud kind="mkt_leads" title="Lead" rows={d.mkt_leads} canEdit={write} empty="Lead yok." heads={['Ad', 'E-posta', 'Kaynak', 'Skor', 'Durum']} cells={(r) => [r.name, r.email, r.source, r.score, <Chip key="s" tone={r.status === 'customer' ? 'ok' : r.status === 'sql' ? 'brand' : undefined}>{r.status}</Chip>]}
          rowActions={(r) => r.status !== 'customer' ? <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('mkt_leads', { id: r.id, status: ({ new: 'mql', mql: 'sql', sql: 'customer' } as const)[r.status as 'new'] }))}>İlerlet</button> : null}
          fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'email', label: 'E-posta', type: 'email' }, { name: 'source', label: 'Kaynak', def: 'Web' }]} build={(v) => ({ name: String(v.name), email: String(v.email), source: String(v.source), campaign_id: null, status: 'new' as const, score: 20 })} />;
        if (t === 'segments') return <Crud kind="segments" title="Segment" rows={d.segments} canEdit={write} empty="Segment yok." heads={['Ad', 'Kural', 'Boyut']} cells={(r) => [<strong key="n">{r.name}</strong>, <code key="r">{r.rule}</code>, r.size]} fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'rule', label: 'Kural', def: 'tag = ' }, { name: 'size', label: 'Tahmini boyut', type: 'number', def: 10 }]} build={(v) => ({ name: String(v.name), rule: String(v.rule), size: Number(v.size) })} />;
        if (t === 'funnel') return <Card title="Pazarlama hunisi"><Funnel steps={[['Lead', d.mkt_leads.length], ['MQL+', d.mkt_leads.filter((l) => l.status !== 'new').length], ['SQL+', d.mkt_leads.filter((l) => ['sql', 'customer'].includes(l.status)).length], ['Müşteri', d.mkt_leads.filter((l) => l.status === 'customer').length]]} /></Card>;
        return <Crud kind="newsletters" title="Bülten" rows={d.newsletters} canEdit={write} empty="Bülten yok." heads={['Konu', 'Segment', 'Durum', 'Açılma']} cells={(r) => [<strong key="n">{r.subject}</strong>, d.segments.find((s) => s.id === r.segment_id)?.name ?? '—', <Chip key="s" tone={r.status === 'sent' ? 'ok' : 'warn'}>{r.status}</Chip>, r.status === 'sent' ? `%${r.open_rate}` : '—']}
          rowActions={(r) => r.status !== 'sent' ? <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('newsletters', { id: r.id, status: 'sent', sent_at: today }))}>Gönder (simüle)</button> : null}
          fields={[{ name: 'subject', label: 'Konu', required: true }, { name: 'seg', label: 'Segment', type: 'select', options: brandOpts(d.segments) }]} build={(v) => ({ subject: String(v.subject), segment_id: String(v.seg), status: 'draft' as const, sent_at: null, open_rate: 0 })} />;
      }}</Await>}
    </ModulePage>
  );
}

/* ───────── EVENTS ───────── */
export function EventsView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession(); const can = useCan(); const { act, busy, Err } = useAct();
  const q = useWorld(['event_items']); const [ev, setEv] = useState(''); const write = can.write('event_items'); const today = todayFor(mode);
  const tabs: Array<[string, string]> = [['portfolio', 'Portfolio'], ['run', 'Run of show'], ['vendors', 'Vendor desk'], ['budget', 'Budget'], ['command', 'Command center']];
  return (
    <ModulePage id="events" title="JS Events" sub="Etkinlik portföyü, akış, tedarikçi ve bütçe" tabs={tabs} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const portfolio = d.event_items.filter((x) => x.kind === 'portfolio'); const names = portfolio.map((p) => p.event.length ? p.title : p.title);
        void names; const cur = portfolio.find((p) => p.id === ev) ?? portfolio[0];
        if (!cur) return <Empty>Etkinlik yok. (Edit Culture & Events organizasyonuna geç.)</Empty>;
        const evName = (p: typeof cur) => p.event || p.title; const mine = d.event_items.filter((x) => x.event === evName(cur));
        const sel = <div className="mb-4 flex items-center gap-2"><label className="label m-0" htmlFor="ev">Etkinlik</label><select id="ev" className="input w-auto" value={cur.id} onChange={(e) => setEv(e.target.value)}>{portfolio.map((p) => <option key={p.id} value={p.id}>{evName(p)}</option>)}</select></div>;
        const add = (kind: 'show' | 'vendor' | 'budget', fields: Array<{ name: string; label: string; type?: 'number' | 'date' | 'text' }>) => write && <FormCard title="Yeni kalem" busy={busy} fields={[{ name: 'title', label: 'Başlık', required: true }, ...fields, { name: 'owner', label: 'Sahip', type: 'select', options: d.team.map((m) => [m.id, m.name]) }]} onSubmit={(v) => act(() => repo!.save('event_items', { event: evName(cur), kind, title: String(v.title), at: v.at ? `${String(v.at)}T12:00:00Z` : cur.at, owner: String(v.owner), status: kind === 'show' ? 'bekliyor' : 'teklif', amount_minor: Math.round(Number(v.amount ?? 0) * 100), note: '' }))} />;
        if (t === 'portfolio') return <Card title="Etkinlik portföyü"><Table heads={['Etkinlik', 'Tarih', 'Sahip', 'Bütçe', 'Durum']}>{portfolio.map((p) => <tr key={p.id}><td><strong>{p.title}</strong></td><td>{fmtDate(p.at)}</td><td>{nameOf(d.team, p.owner).split(' ')[0]}</td><td>{tl(p.amount_minor)}</td><td><Chip>{p.status}</Chip></td></tr>)}</Table></Card>;
        if (t === 'run') {
          const shows = mine.filter((x) => x.kind === 'show').sort((a, b) => a.at.localeCompare(b.at));
          return <div>{sel}{Err}<Card title="Run of show">{shows.length === 0 ? <Empty>Akış yok.</Empty> : <ol className="grid gap-2">{shows.map((s) => <li key={s.id} className="nested flex items-center gap-3 text-sm"><span className="w-14 font-mono">{s.at.slice(11, 16)}</span><span className={`flex-1 ${s.status === 'tamam' ? 'text-muted line-through' : ''}`}>{s.title}</span><span className="text-xs text-muted">{nameOf(d.team, s.owner).split(' ')[0]}</span>{write && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('event_items', { id: s.id, status: s.status === 'tamam' ? 'bekliyor' : 'tamam' }))}>{s.status === 'tamam' ? 'Geri al' : 'Tamam'}</button>}</li>)}</ol>}</Card>
            <div className="mt-4">{add('show', [{ name: 'at', label: 'Tarih', type: 'date' }])}</div></div>;
        }
        if (t === 'vendors') {
          const vs = mine.filter((x) => x.kind === 'vendor');
          return <div className="grid gap-4">{sel}{Err}<Card title="Vendor desk">{vs.length === 0 ? <Empty>Tedarikçi yok.</Empty> : <Table heads={['Tedarikçi / kalem', 'Tarih', 'Tutar', 'Durum', '']}>{vs.map((v) => <tr key={v.id}><td>{v.title}</td><td>{fmtDate(v.at)}</td><td>{tl(v.amount_minor)}</td><td><Chip tone={v.status === 'onaylandı' ? 'ok' : 'warn'}>{v.status}</Chip></td><td>{write && v.status !== 'onaylandı' && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('event_items', { id: v.id, status: 'onaylandı' }))}>Onayla</button>}</td></tr>)}</Table>}</Card>{add('vendor', [{ name: 'amount', label: 'Tutar (₺)', type: 'number' }, { name: 'at', label: 'Tarih', type: 'date' }])}</div>;
        }
        const lines = mine.filter((x) => x.kind === 'budget'); const planned = lines.reduce((s, x) => s + x.amount_minor, 0); const pct = cur.amount_minor ? (planned / cur.amount_minor) * 100 : 0;
        if (t === 'budget') return <div className="grid gap-4">{sel}{Err}<Card title="Bütçe" aside={<Chip tone={toneOf(pct) === 'ok' ? 'ok' : 'warn'}>{tl(planned)} / {tl(cur.amount_minor)}</Chip>}><Bar pct={pct} tone={toneOf(pct)} /><Table heads={['Kalem', 'Tutar', 'Durum']}>{lines.map((l) => <tr key={l.id}><td>{l.title}</td><td>{tl(l.amount_minor)}</td><td>{l.status}</td></tr>)}</Table></Card>{add('budget', [{ name: 'amount', label: 'Tutar (₺)', type: 'number' }])}</div>;
        const shows = mine.filter((x) => x.kind === 'show'); const vend = mine.filter((x) => x.kind === 'vendor'); const daysLeft = Math.ceil((new Date(cur.at).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
        const risks = [vend.some((v) => v.status !== 'onaylandı') && 'Onaysız tedarikçi var', pct > 100 && 'Bütçe aşımı', shows.length < 4 && 'Run of show eksik'].filter(Boolean) as string[];
        return <div className="grid gap-4">{sel}<Grid cols={4}><Metric label="Kalan gün" value={daysLeft} def="Etkinlik tarihine kalan takvim günü." /><Metric label="Akış tamam" value={`${shows.filter((s) => s.status === 'tamam').length}/${shows.length}`} def="Run of show'da tamamlanan kalem sayısı." /><Metric label="Tedarikçi onayı" value={`${vend.filter((v) => v.status === 'onaylandı').length}/${vend.length}`} def="Onaylanan tedarikçi kalemleri." /><Metric label="Bütçe" value={`%${Math.round(pct)}`} tone={pct > 100 ? 'bad' : 'ok'} def="Planlanan bütçe kalemleri / etkinlik bütçesi." /></Grid>
          <Card title="Riskler">{risks.length === 0 ? <p className="text-sm text-muted">Açık risk yok.</p> : <ul className="grid gap-1">{risks.map((r) => <li key={r}><Chip tone="warn">{r}</Chip></li>)}</ul>}</Card></div>;
      }}</Await>}
    </ModulePage>
  );
}
