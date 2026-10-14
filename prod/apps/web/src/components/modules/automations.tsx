'use client';
import { useState } from 'react';
import { AUTOMATION_ACTION_KINDS, type Automation, type AutomationActionKind } from '@jscore/contracts';
import { actionKindOf, resolveRule } from '@/lib/automations/dispatch';
import { Empty, fmtTime, todayFor } from '../ui';
import { useSession } from '../session';
import { Await, Card, Chip, FormCard, Gate, Grid, ModulePage, Table, useAct, useCan, useWorld } from '../mod';

const TABS: Array<[string, string]> = [['catalog', 'Katalog'], ['builder', 'Builder'], ['executions', 'Çalıştırmalar'], ['errors', 'Hata kuyruğu'], ['approvals', 'Onaylar'], ['templates', 'Şablonlar']];
const TRIGGERS: Array<[string, string]> = [['task.state = delivery', 'Görev teslim aşamasına geçti'], ['invoice.overdue', 'Fatura vadesi geçti'], ['allocation.updated', 'Kapasite tahsisi değişti'], ['approval.created', 'Yeni onay talebi'], ['candidate.stage = offer', 'Aday teklif aşamasına geldi'], ['leave.approved', 'İzin onaylandı']];
const KIND_LABEL: Record<AutomationActionKind, string> = { notify: 'Uygulama içi bildirim', create_task: 'Görev oluştur', set_status: 'Görev aşamasını değiştir', webhook: 'Webhook çağır (HMAC imzalı)' };
const paramKey: Record<AutomationActionKind, 'message' | 'title' | 'state' | 'url'> = { notify: 'message', create_task: 'title', set_status: 'state', webhook: 'url' };
/** "yol=değer, yol2=değer2" → filtre nesnesi. */
const parseFilter = (t: string) => Object.fromEntries(t.split(',').map((x) => x.split('=').map((y) => y.trim())).filter(([k, v]) => k && v) as Array<[string, string]>);
const fmtFilter = (f?: Record<string, string>) => Object.entries(f ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
export const AUTOMATION_TEMPLATES = [
  { key: 'csat-after-delivery', name: 'Teslim sonrası CSAT', trigger: 'task.state = delivery', condition: 'proje.client_visible = true', action: 'CSAT anketini müşteri kişisine gönder', action_kind: 'notify' as const, desc: 'Görev teslim edilince müşteri portalındaki CSAT anketini tetikler.' },
  { key: 'overdue-invoice', name: 'Geciken fatura hatırlatma', trigger: 'invoice.overdue', condition: 'gün gecikme >= 3', action: 'Finans kanalına bildirim + e-posta taslağı', action_kind: 'notify' as const, desc: 'Vadesi geçen faturada finans ekibini uyarır.' },
  { key: 'capacity-alert', name: 'Kapasite uyarısı', trigger: 'allocation.updated', condition: 'haftalık yük > 40 saat', action: 'Operasyona bildirim', action_kind: 'notify' as const, desc: '40 saat üstü tahsiste operasyonu bilgilendirir.' },
];

export function AutomationsView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession();
  const can = useCan();
  const q = useWorld(['automations', 'automation_runs']);
  const { act, busy, Err } = useAct();
  const [edit, setEdit] = useState<string>('');
  const write = can.write('automations');
  const today = todayFor(mode);
  const publish = (a: Automation) => act(() => repo!.save('automations', { id: a.id, status: 'published', history: [...a.history, { version: a.version, at: today, status: 'published' }] }));
  const simulate = (a: Automation, status: 'ok' | 'error' | 'pending_approval' = 'ok') => act(async () => {
    await repo!.save('automation_runs', { automation_id: a.id, status, error: status === 'error' ? 'Simüle edilen hata' : null, payload: `test çalıştırma · v${a.version}` });
    await repo!.save('automations', { id: a.id, runs: a.runs + 1 });
  });
  return (
    <ModulePage id="automations" title="JS Automation" sub="Tetikleyici → koşul → aksiyon; taslak → yayın → sürüm" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const nameOfA = (id: string) => d.automations.find((a) => a.id === id)?.name ?? id;
        const runs = [...d.automation_runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (t === 'catalog') return (
          <div className="grid gap-4">{Err}
            {d.automations.length === 0 ? <Empty>Otomasyon yok.</Empty> : <Grid cols={2}>{d.automations.map((a) => (
              <Card key={a.id} title={a.name} aside={<span className="flex gap-1"><Chip tone={a.status === 'published' ? 'ok' : 'warn'}>{a.status === 'published' ? 'Yayında' : 'Taslak'}</Chip><Chip>v{a.version}</Chip></span>}>
                <p className="text-xs text-muted">Tetik: {a.trigger} · Koşul: {a.condition || '—'}</p><p className="mt-1 text-sm">→ {a.action}</p><p className="mt-2 text-xs" data-testid="last-fired">Son tetiklenme: <strong>{a.last_fired_at ? fmtTime(a.last_fired_at) : 'henüz tetiklenmedi'}</strong>{a.status === 'published' ? '' : ' (yalnızca yayındaki kurallar tetiklenir)'}</p><p className="mt-1 text-xs text-muted">Olay: <code>{resolveRule(a)?.event ?? '—'}</code>{a.filter && Object.keys(a.filter).length ? ` · filtre: ${fmtFilter(a.filter)}` : ''} · aksiyon: {KIND_LABEL[actionKindOf(a)]}</p><p className="mt-1 text-xs text-muted">{a.runs} çalıştırma · sürümler: {a.history.map((h) => `v${h.version} ${h.status === 'published' ? 'yayın' : 'taslak'} (${h.at.slice(5)})`).join(', ')}</p>
                {write && <div className="mt-3 flex flex-wrap gap-2">{a.status === 'draft' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void publish(a)}>Yayınla</button>}<button className="btn btn-sm" disabled={busy || a.status !== 'published'} onClick={() => void simulate(a)}>Test çalıştır</button><button className="btn btn-ghost btn-sm" onClick={() => setEdit(a.id)}>Düzenle</button></div>}
              </Card>))}</Grid>}
            <Card title="Çalıştırma günlüğü" aside={<Chip>{runs.length} kayıt</Chip>}>{runs.length === 0 ? <Empty>Henüz çalıştırma yok. Yayındaki bir kural, eşleşen bir olay oluşunca burada görünür.</Empty> : <Table heads={['Zaman', 'Otomasyon', 'Olay', 'Durum', 'Detay']}>{runs.slice(0, 8).map((r) => <tr key={r.id}><td>{fmtTime(r.created_at)}</td><td>{nameOfA(r.automation_id)}</td><td><code>{r.event_type ?? 'manuel'}</code></td><td><Chip tone={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'bad' : 'warn'}>{r.status}</Chip></td><td className="text-muted">{r.error ?? r.payload}</td></tr>)}</Table>}</Card>
          </div>
        );
        if (t === 'builder') {
          const cur = d.automations.find((a) => a.id === edit);
          return (
            <Gate ok={write} why="Otomasyon oluşturma yetkin yok."><div className="grid gap-4">{Err}
              <FormCard key={edit} title={cur ? `Düzenle: ${cur.name} (sürüm v${cur.version}${cur.status === 'published' ? ' · yayında → kayıt yeni taslak sürümü açar' : ''})` : 'Yeni otomasyon (taslak)'} busy={busy} submit={cur ? 'Taslak olarak kaydet' : 'Taslak oluştur'}
                fields={[{ name: 'name', label: 'Ad', required: true, def: cur?.name }, { name: 'trigger', label: 'Tetikleyici', type: 'select', options: TRIGGERS, def: cur?.trigger }, { name: 'condition', label: 'Koşul', def: cur?.condition ?? '' }, { name: 'filter', label: 'Olay filtresi (yol=değer, virgülle)', def: fmtFilter(cur?.filter), wide: true }, { name: 'action_kind', label: 'Aksiyon', type: 'select', options: AUTOMATION_ACTION_KINDS.map((k) => [k, KIND_LABEL[k]]), def: cur ? actionKindOf(cur) : 'notify' }, { name: 'param', label: 'Aksiyon parametresi (mesaj · başlık · aşama · URL)', def: cur?.action_config ? (Object.values(cur.action_config)[0] ?? '') : '', wide: true }]}
                onSubmit={(v) => act(async () => {
                  const kind = String(v.action_kind) as AutomationActionKind;
                  const param = String(v.param).trim();
                  const base = { name: String(v.name), trigger: String(v.trigger), condition: String(v.condition), action: KIND_LABEL[kind], action_kind: kind, action_config: param ? { [paramKey[kind]]: param } : {}, filter: parseFilter(String(v.filter)) };
                  if (cur) { const nv = cur.status === 'published' ? cur.version + 1 : cur.version; await repo!.save('automations', { id: cur.id, ...base, status: 'draft', version: nv, history: [...cur.history, { version: nv, at: today, status: 'draft' }] }); }
                  else await repo!.save('automations', { ...base, status: 'draft', version: 1, template: null, runs: 0, history: [{ version: 1, at: today, status: 'draft' }] });
                  setEdit('');
                })} />
              {cur && <button className="btn btn-sm w-fit" onClick={() => setEdit('')}>Yeni oluşturmaya dön</button>}
            </div></Gate>
          );
        }
        if (t === 'executions') return <Card title="Çalıştırmalar">{runs.length === 0 ? <Empty>Henüz çalıştırma yok.</Empty> : <Table heads={['Zaman', 'Otomasyon', 'Durum', 'Detay']}>{runs.map((r) => <tr key={r.id}><td>{fmtTime(r.created_at)}</td><td>{nameOfA(r.automation_id)}</td><td><Chip tone={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'bad' : 'warn'}>{r.status}</Chip></td><td className="text-muted">{r.error ?? r.payload}</td></tr>)}</Table>}</Card>;
        if (t === 'errors') { const errs = runs.filter((r) => r.status === 'error'); return <div className="grid gap-3">{Err}<Card title="Hata kuyruğu">{errs.length === 0 ? <Empty>Hata yok. Kuyruk temiz.</Empty> : <Table heads={['Zaman', 'Otomasyon', 'Hata', '']}>{errs.map((r) => <tr key={r.id}><td>{fmtTime(r.created_at)}</td><td>{nameOfA(r.automation_id)}</td><td className="text-magenta">{r.error}</td><td>{write && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('automation_runs', { id: r.id, status: 'ok', error: null, payload: `${r.payload} · yeniden denendi` }))}>Yeniden dene</button>}</td></tr>)}</Table>}</Card></div>; }
        if (t === 'approvals') { const pend = runs.filter((r) => r.status === 'pending_approval'); return <div className="grid gap-3">{Err}<Card title="Onay bekleyen çalıştırmalar">{pend.length === 0 ? <Empty>Onay bekleyen yok.</Empty> : <Table heads={['Zaman', 'Otomasyon', 'Detay', '']}>{pend.map((r) => <tr key={r.id}><td>{fmtTime(r.created_at)}</td><td>{nameOfA(r.automation_id)}</td><td className="text-muted">{r.payload}</td><td className="whitespace-nowrap">{write && <><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('automation_runs', { id: r.id, status: 'ok' }))}>Onayla</button> <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('automation_runs', { id: r.id, status: 'error', error: 'Onay reddedildi' }))}>Reddet</button></>}</td></tr>)}</Table>}</Card></div>; }
        return (
          <div className="grid gap-4">{Err}
            <Grid cols={3}>{AUTOMATION_TEMPLATES.map((tp) => { const used = d.automations.some((a) => a.template === tp.key); return (
              <Card key={tp.key} title={tp.name} aside={used ? <Chip tone="ok">Kullanımda</Chip> : undefined}><p className="text-sm text-muted">{tp.desc}</p><p className="mt-2 text-xs">Tetik: {tp.trigger}</p>
                {write && <button className="btn btn-sm mt-3" disabled={busy || used} onClick={() => void act(() => repo!.save('automations', { name: tp.name, trigger: tp.trigger, condition: tp.condition, action: tp.action, action_kind: tp.action_kind, status: 'draft', version: 1, template: tp.key, runs: 0, history: [{ version: 1, at: today, status: 'draft' }] }))}>{used ? 'Eklendi' : 'Şablondan oluştur'}</button>}</Card>); })}</Grid>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}
