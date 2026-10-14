'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isClientRole, TASK_STATE_LABELS, type SurveyResponse } from '@jscore/contracts';
import { Empty, fmtDate, useData } from '../ui';
import { useSession } from '../session';
import { Await, Bar, Card, Chip, CsvButton, FormCard, Grid, Metric, ModulePage, Table, brandName, useAct, useWorld } from '../mod';
import { surveyStats } from '@/lib/domain';

const TABS: Array<[string, string]> = [['home', 'Home'], ['requests', 'Requests'], ['projects', 'Projects'], ['approvals', 'Approvals'], ['files', 'Files'], ['reports', 'Reports'], ['surveys', 'Anketler'], ['contacts', 'Contacts'], ['settings', 'Settings']];

export function PortalView({ tab }: { tab?: string }) {
  const { me, repo } = useSession();
  const q = useWorld(['client_requests', 'media_assets', 'surveys', 'survey_responses', 'crm_contacts', 'social_posts']);
  const ap = useData((r) => r.listApprovals());
  const { act, busy, Err } = useAct();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ mail: true, weekly: true });
  useEffect(() => { try { const s = localStorage.getItem('js_portal_prefs'); if (s) setPrefs(JSON.parse(s) as Record<string, boolean>); } catch { /* yok */ } }, []);
  const setPref = (k: string) => setPrefs((p) => { const n = { ...p, [k]: !p[k] }; try { localStorage.setItem('js_portal_prefs', JSON.stringify(n)); } catch { /* yok */ } return n; });
  const client = !!me && isClientRole(me.role); const admin = me?.role === 'client_admin';
  const [brandSel, setBrandSel] = useState('');
  return (
    <ModulePage id="portal" title="JS Client Portal" sub={client ? 'Yalnızca kendi markalarınızın işleri — iç notlar ve finans verisi gösterilmez' : 'Müşteri gözünden önizleme'} tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const brands = d.brands.filter((b) => !b.internal || !client); const brand = brands.find((b) => b.id === brandSel) ?? brands[0];
        if (!brand) return <Empty>Görüntülenecek marka yok.</Empty>;
        const approvals = (ap.data ?? []).filter((a) => a.subject.brand_id === brand.id && a.required_role.startsWith('client'));
        const pending = approvals.filter((a) => a.status === 'pending');
        const projects = d.projects.filter((p) => p.brand_id === brand.id);
        const requests = d.client_requests.filter((r) => r.brand_id === brand.id);
        const files = d.media_assets.filter((m) => m.brand_id === brand.id);
        const picker = brands.length > 1 && <div className="mb-4 flex items-center gap-2"><label className="label m-0" htmlFor="pb">Marka</label><select id="pb" className="input w-auto" value={brand.id} onChange={(e) => setBrandSel(e.target.value)}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>;
        const body = (() => {
          if (t === 'home') return (
            <div className="grid gap-4">
              <Grid cols={4}>
                <Metric label="Aktif proje" value={projects.filter((p) => p.status === 'active').length} def="Sizinle paylaşılan ve devam eden projeler." />
                <Metric label="Onayınızı bekleyen" value={pending.length} tone={pending.length ? 'warn' : 'ok'} def="Karar verilmesi gereken onay talepleri." />
                <Metric label="Açık talep" value={requests.filter((r) => r.status !== 'accepted' && r.status !== 'rejected').length} def="Henüz sonuçlanmamış taleplerin sayısı." />
                <Metric label="Dosya" value={files.length} def="Sizinle paylaşılan dosya sayısı." />
              </Grid>
              <Card title="Yaklaşan teslimler">{projects.length === 0 ? <Empty>Paylaşılan proje yok.</Empty> : <ul className="grid gap-2">{projects.map((p) => <li key={p.id} className="nested flex justify-between gap-2 text-sm"><span>{p.name}</span><Chip>{fmtDate(p.due_at)}</Chip></li>)}</ul>}</Card>
            </div>
          );
          if (t === 'requests') return (
            <div className="grid gap-4">{Err}
              <Card title="Taleplerim">{requests.length === 0 ? <Empty>Henüz talep yok.</Empty> : <Table heads={['Talep', 'Çıktı', 'Teslim', 'Durum']}>{requests.map((r) => <tr key={r.id}><td>{r.title}</td><td className="text-muted">{r.brief.deliverable}</td><td>{fmtDate(r.brief.deadline)}</td><td><Chip tone={r.status === 'accepted' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Chip></td></tr>)}</Table>}</Card>
              {(admin || !client) && <FormCard title="Yeni talep · brief (5 unsur)" busy={busy} submit="Talebi gönder" fields={[{ name: 'title', label: 'Talep başlığı', required: true, wide: true }, { name: 'goal', label: '1. Hedef', type: 'textarea', required: true }, { name: 'audience', label: '2. Hedef kitle', required: true }, { name: 'deliverable', label: '3. Çıktı / teslimat', required: true }, { name: 'message', label: '4. Mesaj / ton', required: true }, { name: 'deadline', label: '5. Tarih', type: 'date', required: true, def: '2026-10-30' }]}
                onSubmit={(v) => act(() => repo!.save('client_requests', { brand_id: brand.id, title: String(v.title), status: 'new', created_by: me?.name ?? '', brief: { goal: String(v.goal), audience: String(v.audience), deliverable: String(v.deliverable), message: String(v.message), deadline: String(v.deadline) } }))} />}
              {client && !admin && <p className="text-xs text-muted">Talep oluşturma Client Admin yetkisindedir.</p>}
              {!client && requests.filter((r) => r.status === 'new').map((r) => <div key={r.id} className="nested flex items-center justify-between text-sm"><span>{r.title}</span><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('client_requests', { id: r.id, status: 'review' }))}>İncelemeye al</button></div>)}
            </div>
          );
          if (t === 'projects') return <Card title="Projeler">{projects.length === 0 ? <Empty>Paylaşılan proje yok.</Empty> : <Table heads={['Proje', 'Aşama', 'İlerleme', 'Teslim']}>{projects.map((p) => { const done = p.stage_plan.filter((s) => s.done).length; return <tr key={p.id}><td>{p.name}<div className="text-xs text-muted">{p.summary}</div></td><td><Chip tone="brand">{TASK_STATE_LABELS[p.flow_stage]}</Chip></td><td className="min-w-28"><Bar pct={(done / Math.max(1, p.stage_plan.length)) * 100} /></td><td>{fmtDate(p.due_at)}</td></tr>; })}</Table>}</Card>;
          if (t === 'approvals') {
            const review = d.social_posts.filter((p) => p.brand_id === brand.id && p.status === 'review');
            return (
              <div className="grid gap-4">{Err}
                <Card title="Sosyal takvim · toplu onay" aside={<Chip>{review.length} gönderi</Chip>}>
                  {review.length === 0 ? <Empty>Onay bekleyen gönderi yok.</Empty> : <><ul className="mb-3 grid gap-2">{review.map((p) => <li key={p.id} className="nested text-sm"><strong>{fmtDate(p.date)}</strong> · {p.channel} · {p.format} — {p.copy}</li>)}</ul>
                    <button className="btn btn-primary" disabled={busy || !admin} title={admin ? '' : 'Yalnızca Client Admin onaylayabilir'} onClick={() => void act(() => repo!.approveSocialBatch(brand.id))}>Tümünü onayla ({review.length})</button>{!admin && <p className="mt-1 text-xs text-muted">Nihai onay Client Admin’dedir.</p>}</>}
                </Card>
                <Card title="Sürüm ve karar onayları">
                  {approvals.length === 0 ? <Empty>Onay talebi yok.</Empty> : <ul className="grid gap-3">{approvals.map((a) => (
                    <li key={a.id} className="nested"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{a.title}</strong>{a.subject.version && <Chip tone="brand">{a.subject.version}</Chip>}<Chip tone={a.status === 'approved' ? 'ok' : a.status === 'rejected' ? 'bad' : 'warn'}>{a.status}</Chip><span className="text-xs text-muted">Son tarih {fmtDate(a.due_at)}</span></div>
                      {a.status === 'pending' && admin && <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => e.preventDefault()}><input id={`n${a.id}`} className="input min-w-40 flex-1" placeholder="Not (isteğe bağlı)" aria-label="Karar notu" />
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideApproval(a.id, 'approved', (document.getElementById(`n${a.id}`) as HTMLInputElement).value || undefined))}>Onayla</button>
                        <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideApproval(a.id, 'rejected', (document.getElementById(`n${a.id}`) as HTMLInputElement).value || undefined))}>Revize iste</button></form>}
                      {a.decision_note && <p className="mt-1 text-xs text-muted">Not: {a.decision_note}</p>}</li>))}</ul>}
                </Card>
              </div>
            );
          }
          if (t === 'files') return <Card title="Dosyalar">{files.length === 0 ? <Empty>Paylaşılan dosya yok.</Empty> : <Table heads={['Dosya', 'Tür', 'Sürüm', 'Boyut', '']}>{files.map((f) => <tr key={f.id}><td>{f.name}</td><td>{f.kind}</td><td>v{f.version}</td><td>{f.size_mb >= 1000 ? `${(f.size_mb / 1000).toFixed(1)} GB` : `${f.size_mb} MB`}</td><td>{f.kind === 'video' ? <Link className="btn btn-sm" href="/watch/demo">İzle</Link> : <span className="text-xs text-muted">İndirme bağlantısı üretimde</span>}</td></tr>)}</Table>}</Card>;
          if (t === 'reports') {
            const rows = projects.map((p) => [p.name, TASK_STATE_LABELS[p.flow_stage], p.stage_plan.filter((s) => s.done).length, p.stage_plan.length, p.due_at]);
            return <Card title="Durum raporu" aside={<CsvButton name={`${brand.name}-rapor.csv`} rows={[['Proje', 'Aşama', 'Biten adım', 'Toplam adım', 'Teslim'], ...rows]} />}>{rows.length === 0 ? <Empty>Rapor için proje yok.</Empty> : <Table heads={['Proje', 'Aşama', 'Adım', 'Teslim']}>{rows.map((r) => <tr key={String(r[0])}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}/{r[3]}</td><td>{fmtDate(String(r[4]))}</td></tr>)}</Table>}</Card>;
          }
          if (t === 'surveys') {
            const mineResp = (sid: string) => d.survey_responses.filter((r) => r.survey_id === sid && r.brand_id === brand.id);
            return (
              <div className="grid gap-4">{Err}
                {d.surveys.length === 0 ? <Empty>Aktif anket yok.</Empty> : d.surveys.map((s) => { const st = surveyStats(s.kind, mineResp(s.id)); const max = s.kind === 'csat' ? 5 : 10; return (
                  <Card key={s.id} title={s.title} aside={<Chip>{st.n} cevap</Chip>}>
                    <p className="mb-2 text-sm text-muted">{s.kind === 'csat' ? 'Teslimden memnuniyetiniz (1 = çok kötü, 5 = çok iyi)' : 'Bizi bir meslektaşınıza tavsiye eder misiniz? (0–10)'}</p>
                    {st.n > 0 && <p className="mb-2 text-sm">Marka ortalaması: <strong>{s.kind === 'csat' ? st.value : `NPS ${st.value}`}</strong></p>}
                    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void act(() => repo!.save('survey_responses', { survey_id: s.id, brand_id: brand.id, score: Number(f.get('score')), comment: String(f.get('comment') ?? '') } as Omit<SurveyResponse, 'id' | 'org_id' | 'created_at'>)); }}>
                      <div><label className="label" htmlFor={`sc${s.id}`}>Puan</label><select id={`sc${s.id}`} name="score" className="input w-24" defaultValue={String(max)}>{Array.from({ length: s.kind === 'csat' ? 5 : 11 }, (_, i) => (s.kind === 'csat' ? i + 1 : i)).map((n) => <option key={n}>{n}</option>)}</select></div>
                      <div className="min-w-48 flex-1"><label className="label" htmlFor={`cm${s.id}`}>Yorum</label><input id={`cm${s.id}`} name="comment" className="input" /></div><button className="btn btn-primary" disabled={busy}>Gönder</button>
                    </form>
                  </Card>); })}
              </div>
            );
          }
          if (t === 'contacts') return <Card title="Marka kişileri">{d.crm_contacts.filter((c) => c.brand_id === brand.id).length === 0 ? <Empty>Kişi yok.</Empty> : <Table heads={['Ad', 'Ünvan', 'E-posta', 'Telefon']}>{d.crm_contacts.filter((c) => c.brand_id === brand.id).map((c) => <tr key={c.id}><td>{c.name}</td><td className="text-muted">{c.title}</td><td>{c.email}</td><td>{c.phone}</td></tr>)}</Table>}</Card>;
          return (
            <div className="grid max-w-2xl gap-4">
              <Card title="Marka"><p className="text-sm">{brandName(d.brands, brand.id)} · {brand.sector}</p>{brand.compliance_flags.length > 0 && <p className="mt-2 text-xs text-muted">Uyumluluk notu: {brand.compliance_flags.join(', ')}</p>}</Card>
              <Card title="Bildirimler (bu tarayıcı)">{[['mail', 'Onay istekleri için e-posta'], ['weekly', 'Haftalık özet']].map(([k, l]) => <label key={k} className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!prefs[k]} onChange={() => setPref(k)} /> {l}</label>)}</Card>
            </div>
          );
        })();
        return <>{picker}{body}</>;
      }}</Await>}
    </ModulePage>
  );
}
