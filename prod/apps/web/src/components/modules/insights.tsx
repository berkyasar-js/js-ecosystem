'use client';
import { COLL_KEYS, DEAL_STAGES, DEAL_STAGE_LABELS } from '@jscore/contracts';
import { Empty, fmtTime, todayFor, useData } from '../ui';
import { useSession } from '../session';
import { Await, Card, Chip, CsvButton, Freshness, Gate, Grid, Metric, ModulePage, Table, brandName, nameOf, tl, useCan, useWorld } from '../mod';
import { BarChart, Funnel, LineChart } from '../charts';
import { projectMargins } from './finance';
import { accountHealth, surveyBelowThreshold, surveyStats, weeklyCapacity, weeksFrom } from '@jscore/core/domain';
import { isOverdue } from '../work/work-utils';

const TABS: Array<[string, string]> = [['executive', 'Executive'], ['profitability', 'Project Profitability'], ['resources', 'Resource Analytics'], ['funnel', 'Sales Funnel'], ['clients', 'Client Reports'], ['system', 'System Analytics']];
const KINDS = ['crm_deals', 'mkt_leads', 'invoices', 'expenses', 'cost_rates', 'time_entries', 'allocations', 'leaves', 'surveys', 'survey_responses', 'campaigns', 'automation_runs'] as const;

export function InsightsView({ tab }: { tab?: string }) {
  const { mode } = useSession();
  const can = useCan();
  const q = useWorld(KINDS);
  const sys = useData(async (r) => ({ runs: await r.listAgentRuns().catch(() => []), audit: await r.listAudit().catch(() => []), approvals: await r.listApprovals().catch(() => []) }));
  const today = todayFor(mode);
  const weeks = weeksFrom(today, 6);
  return (
    <ModulePage id="insights" title="JS Insights" sub="Analitik — her metriğin tanımı (i) simgesindedir" tabs={TABS} tab={tab} actions={<Freshness />}>
      {(t) => <Await q={q}>{(d) => {
        const paid = d.invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount_minor, 0);
        const csat = d.surveys.find((s) => s.kind === 'csat'); const nps = d.surveys.find((s) => s.kind === 'nps');
        const respOf = (sid?: string, brand?: string) => d.survey_responses.filter((r) => r.survey_id === sid && (!brand || r.brand_id === brand));
        if (t === 'executive') {
          const byMonth = ['07', '08', '09', '10'].map((m) => [`${m}. ay`, d.invoices.filter((i) => i.issued_at.slice(5, 7) === m).reduce((s, i) => s + i.amount_minor / 100, 0)] as [string, number]);
          return (
            <div className="grid gap-4">
              <Grid cols={4}>
                <Metric label="Tahsil edilen" value={tl(paid)} def="Ödendi durumundaki faturaların toplamı." tone="ok" />
                <Metric label="Açık pipeline" value={tl(d.crm_deals.filter((x) => !['won', 'lost'].includes(x.stage)).reduce((s, x) => s + x.value_minor, 0))} def="Yeni/Görüşme/Teklif aşamasındaki fırsat toplamı." />
                <Metric label="Aktif proje" value={d.projects.filter((p) => p.status === 'active').length} def="Durumu active olan projeler." />
                <Metric label="CSAT" value={respOf(csat?.id).length ? surveyStats('csat', respOf(csat?.id)).value : '—'} def="Teslim sonrası anket ortalaması (1–5)." />
              </Grid>
              <Grid cols={2}>
                <Card title="Aylık faturalanan (₺)" aside={<CsvButton name="faturalanan.csv" rows={[['Ay', 'Tutar'], ...byMonth]} />}><BarChart data={byMonth} fmt={(n) => `${Math.round(n / 1000)}b`} label="Aylık faturalanan" /></Card>
                <Card title="Pipeline aşamaları (adet)"><BarChart data={DEAL_STAGES.map((s) => [DEAL_STAGE_LABELS[s], d.crm_deals.filter((x) => x.stage === s).length])} label="Pipeline" /></Card>
              </Grid>
            </div>
          );
        }
        if (t === 'profitability') {
          if (!can.read('cost_rates')) return <Gate ok={false} why="Marj analizi için finans yetkisi gerekir; maliyet oranları diğer rollere gösterilmez." ><span /></Gate>;
          const rows = projectMargins({ ...d });
          return (
            <div className="grid gap-4">
              <Card title="Proje marjı %" aside={<CsvButton name="proje-marji.csv" rows={[['Proje', 'Gelir', 'Maliyet', 'Marj', 'Marj %'], ...rows.map((r) => [r.project.name, r.project.budget_minor / 100, r.cost_minor / 100, r.margin_minor / 100, r.margin_pct])]} />}>
                <BarChart data={rows.map((r) => [r.project.name.split('·')[0].trim(), r.margin_pct])} fmt={(n) => `%${n}`} label="Proje marjı yüzdesi" />
                <p className="mt-2 text-xs text-muted">Marj = Gelir − (Σ saat × saatlik maliyet + direkt gider). Maaş verisi kullanılmaz; kişi bazlı maliyet gösterilmez.</p>
              </Card>
              <Card title="Detay"><Table heads={['Proje', 'Gelir', 'Maliyet', 'Marj %']}>{rows.map((r) => <tr key={r.project.id}><td>{r.project.name}</td><td>{tl(r.project.budget_minor)}</td><td>{tl(r.cost_minor)}</td><td><Chip tone={r.margin_pct < 20 ? 'bad' : 'ok'}>%{r.margin_pct}</Chip></td></tr>)}</Table></Card>
            </div>
          );
        }
        if (t === 'resources') {
          const active = d.team.filter((m) => m.status === 'active');
          const avg = active.map((m) => [m.name.split(' ')[0], Math.round(weeks.reduce((s, w) => s + Math.min(999, weeklyCapacity(m, w, d.allocations, d.leaves).load_pct), 0) / weeks.length)] as [string, number]);
          const over = active.flatMap((m) => weeks.filter((w) => weeklyCapacity(m, w, d.allocations, d.leaves).over40).map((w) => `${m.name.split(' ')[0]} (${w.slice(5)})`));
          return (
            <div className="grid gap-4">
              <Grid cols={3}><Metric label="Ort. doluluk" value={`%${avg.length ? Math.round(avg.reduce((s, [, v]) => s + v, 0) / avg.length) : 0}`} def="6 haftalık tahsis / kapasite ortalaması (izin düşülmüş)." /><Metric label=">40 saat hücre" value={over.length} tone={over.length ? 'bad' : 'ok'} def="Haftalık tahsisi 40 saati aşan kişi×hafta." /><Metric label="Zaman girişi (saat)" value={Math.round(d.time_entries.reduce((s, e) => s + e.minutes, 0) / 60)} def="Kayıtlı tüm zaman girişleri." /></Grid>
              <Card title="Ortalama doluluk % (6 hafta)" aside={<CsvButton name="doluluk.csv" rows={[['Kişi', 'Doluluk %'], ...avg]} />}><BarChart data={avg} fmt={(n) => `%${n}`} label="Ortalama doluluk" /></Card>
              {over.length > 0 && <Card title="Aşırı yük"><p className="text-sm">{over.join(', ')}</p></Card>}
            </div>
          );
        }
        if (t === 'funnel') {
          const deals = d.crm_deals;
          return (
            <Grid cols={2}>
              <Card title="Satış hunisi (fırsat)" aside={<CsvButton name="satis-hunisi.csv" rows={[['Aşama', 'Adet', 'Tutar'], ...DEAL_STAGES.map((s) => [DEAL_STAGE_LABELS[s], deals.filter((x) => x.stage === s).length, deals.filter((x) => x.stage === s).reduce((a, x) => a + x.value_minor / 100, 0)])]} />}>
                <Funnel steps={[['Yeni', deals.length], ['Görüşme+', deals.filter((x) => x.stage !== 'new').length], ['Teklif+', deals.filter((x) => ['proposal', 'won'].includes(x.stage)).length], ['Kazanıldı', deals.filter((x) => x.stage === 'won').length]]} />
              </Card>
              <Card title="Pazarlama lead hunisi"><Funnel steps={[['Lead', d.mkt_leads.length], ['MQL+', d.mkt_leads.filter((l) => l.status !== 'new').length], ['SQL+', d.mkt_leads.filter((l) => ['sql', 'customer'].includes(l.status)).length], ['Müşteri', d.mkt_leads.filter((l) => l.status === 'customer').length]]} /></Card>
            </Grid>
          );
        }
        if (t === 'clients') {
          const rows = d.brands.filter((b) => !b.internal).map((b) => {
            const pids = new Set(d.projects.filter((p) => p.brand_id === b.id).map((p) => p.id));
            const late = d.tasks.filter((x) => pids.has(x.project_id) && x.state !== 'archive' && isOverdue(x, today)).length;
            const od = d.invoices.filter((i) => i.brand_id === b.id && i.status === 'overdue').length;
            const cs = respOf(csat?.id, b.id); const np = respOf(nps?.id, b.id);
            return { b, health: accountHealth(b.health, { overdueTasks: late, overdueInvoices: od, csat: cs.length ? surveyStats('csat', cs).value : undefined }), csat: cs.length ? surveyStats('csat', cs).value : null, nps: np.length ? surveyStats('nps', np).value : null, alert: surveyBelowThreshold('csat', cs, csat?.threshold ?? 4) || surveyBelowThreshold('nps', np, nps?.threshold ?? 0), late, od };
          }).sort((a, b) => a.health - b.health);
          return (
            <div className="grid gap-4">
              <Card title="Düşük memnuniyet uyarıları (eşik altı)">{rows.filter((r) => r.alert).length === 0 ? <Empty>Eşik altı müşteri yok.</Empty> : <ul className="grid gap-2">{rows.filter((r) => r.alert).map((r) => <li key={r.b.id} className="nested flex justify-between text-sm"><span>{r.b.name}</span><Chip tone="bad">CSAT {r.csat ?? '—'} · NPS {r.nps ?? '—'}</Chip></li>)}</ul>}</Card>
              <Card title="Müşteri raporu" aside={<CsvButton name="musteri-raporu.csv" rows={[['Marka', 'Sağlık', 'CSAT', 'NPS', 'Geciken görev', 'Geciken fatura'], ...rows.map((r) => [r.b.name, r.health, r.csat, r.nps, r.late, r.od])]} />}>
                <Table heads={['Marka', 'Sağlık', 'CSAT', 'NPS', 'Geciken görev', 'Geciken fatura']}>{rows.map((r) => <tr key={r.b.id}><td>{brandName(d.brands, r.b.id)}</td><td><Chip tone={r.health < 55 ? 'bad' : r.health < 70 ? 'warn' : 'ok'}>{r.health}</Chip></td><td>{r.csat ?? '—'}</td><td>{r.nps ?? '—'}</td><td>{r.late}</td><td>{r.od}</td></tr>)}</Table>
              </Card>
            </div>
          );
        }
        return (
          <Await q={sys}>{(s) => {
            const counts = COLL_KEYS.map((k) => [k, (d as unknown as Record<string, unknown[]>)[k]?.length ?? 0] as [string, number]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
            const missing = d.tasks.filter((x) => !x.assignee_id).length;
            return (
              <div className="grid gap-4">
                <Grid cols={4}>
                  <Metric label="Denetim olayı" value={s.audit.length} def="audit_events tablosundaki kayıt sayısı (yetkine göre)." />
                  <Metric label="Ajan maliyeti" value={`$${s.runs.reduce((a, r) => a + r.cost_usd, 0).toFixed(2)}`} def="Ajan çalıştırmalarının toplam USD maliyeti." />
                  <Metric label="Atanmamış görev" value={missing} tone={missing ? 'warn' : 'ok'} def="Veri kalitesi: assignee boş görevler." />
                  <Metric label="Otomasyon hataları" value={d.automation_runs.filter((r) => r.status === 'error').length} tone={d.automation_runs.some((r) => r.status === 'error') ? 'bad' : 'ok'} def="Hata durumundaki otomasyon çalıştırmaları." />
                </Grid>
                <Card title="Kayıt sayıları (en büyük 10 koleksiyon)"><BarChart data={counts} label="Koleksiyon boyutları" /></Card>
                <Card title="Son denetim olayları">{s.audit.length === 0 ? <Empty>Bu rol için denetim kaydı görünmüyor.</Empty> : <Table heads={['Zaman', 'Kim', 'İşlem', 'Kaynak']}>{s.audit.slice(0, 8).map((e) => <tr key={e.id}><td>{fmtTime(e.occurred_at)}</td><td>{e.actor_name}</td><td>{e.action}</td><td className="text-muted">{e.resource}</td></tr>)}</Table>}</Card>
                <LineChart labels={['Tem', 'Ağu', 'Eyl', 'Eki']} series={[{ name: 'Fatura adedi', values: ['07', '08', '09', '10'].map((m) => d.invoices.filter((i) => i.issued_at.slice(5, 7) === m).length) }]} label="Aylık fatura adedi" />
                <p className="text-xs text-muted">{nameOf(d.team, 'BY')} adına demo veri. Veri tazeliği damgası sayfa başlığındadır.</p>
              </div>
            );
          }}</Await>
        );
      }}</Await>}
    </ModulePage>
  );
}
