'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Approval, Expense } from '@jscore/contracts';
import { Empty, fmtDate, money, todayFor, useData } from '../ui';
import { useSession } from '../session';
import { Await, Bar, Card, Chip, Crud, FormCard, Gate, Grid, Metric, ModulePage, Table, brandName, nameOf, tl, toneOf, useAct, useCan, useWorld } from '../mod';
import { BarChart } from '../charts';
import { MARGIN_EXPLAIN, addDays, marginFormula, proposalTotals } from '@/lib/domain';

const TABS: Array<[string, string]> = [['summary', 'Özet'], ['quotes', 'Teklifler'], ['budgets', 'Bütçeler'], ['expenses', 'Giderler'], ['purchasing', 'Satın alma'], ['suppliers', 'Tedarikçiler'], ['invoices', 'Faturalar & tahsilat'], ['margin', 'Marj'], ['ledger', 'Şirket defteri']];
export const OPENING_CASH_MINOR = 150000000; // 1,5 M ₺ — demo açılış bakiyesi
const COMPANIES: Array<[string, string]> = [['org_jobs', 'Jobs Studio'], ['org_edit', 'Edit Events']];
const EXP_TONE: Record<string, 'ok' | 'warn' | 'bad' | undefined> = { paid: 'ok', approved: 'ok', pending: 'warn', rejected: 'bad' };

/** Proje marjı: gelir = proje bütçesi (anlaşılan tutar); işçilik = Σ dakika×saatlik maliyet (kişi bazı gösterilmez); direkt gider = onaylı/ödenmiş giderler. */
export function projectMargins(d: { projects: Array<{ id: string; name: string; budget_minor: number; brand_id: string }>; tasks: Array<{ id: string; project_id: string }>; time_entries: Array<{ task_id: string | null; employee_id: string; minutes: number }>; cost_rates: Array<{ employee_id: string; hourly_cost_minor: number }>; expenses: Expense[] }) {
  return d.projects.map((p) => {
    const tids = new Set(d.tasks.filter((t) => t.project_id === p.id).map((t) => t.id));
    const hours = d.time_entries.filter((e) => e.task_id && tids.has(e.task_id)).map((e) => ({ hours: e.minutes / 60, hourly_cost_minor: d.cost_rates.find((c) => c.employee_id === e.employee_id)?.hourly_cost_minor ?? 0 }));
    const direct = d.expenses.filter((x) => x.project_id === p.id && (x.status === 'approved' || x.status === 'paid')).reduce((s, x) => s + x.amount_minor, 0);
    return { project: p, hours: hours.reduce((s, h) => s + h.hours, 0), ...marginFormula({ revenue_minor: p.budget_minor, hours, direct_expense_minor: direct }) };
  });
}

export function FinanceView({ tab }: { tab?: string }) {
  const { mode, repo, me } = useSession();
  const can = useCan();
  const q = useWorld(['crm_proposals', 'budgets', 'expenses', 'purchase_requests', 'suppliers', 'invoices', 'ledger_entries', 'cost_rates', 'time_entries']);
  const ap = useData((r) => r.listApprovals());
  const { act, busy, Err } = useAct();
  const today = todayFor(mode);
  const [co, setCo] = useState('all');
  const write = can.write('invoices'); const exWrite = can.write('expenses');
  return (
    <ModulePage id="finance" title="JS Finance" sub="Nakit, bütçe, gider, satın alma, fatura ve marj — maaş verisi gösterilmez" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const supplier = (id: string | null) => d.suppliers.find((s) => s.id === id)?.name ?? '—';
        const approvals: Approval[] = ap.data ?? [];
        const ledgerNet = (rows: typeof d.ledger_entries) => rows.reduce((s, e) => s + (e.kind === 'income' ? e.amount_minor : e.kind === 'expense' ? -e.amount_minor : 0), 0);
        if (t === 'summary') {
          const net = ledgerNet(d.ledger_entries); const expenses = d.ledger_entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount_minor, 0);
          const cash = OPENING_CASH_MINOR + net; const runway = expenses > 0 ? Math.round((cash / expenses) * 10) / 10 : 0;
          const open = d.invoices.filter((i) => i.status !== 'paid'); const overdue = d.invoices.filter((i) => i.status === 'overdue');
          const invoiced90 = d.invoices.filter((i) => i.issued_at >= addDays(today, -90)).reduce((s, i) => s + i.amount_minor, 0);
          const dso = invoiced90 ? Math.round((open.reduce((s, i) => s + i.amount_minor, 0) / invoiced90) * 90) : 0;
          return (
            <div className="grid gap-4">
              <Grid cols={4}>
                <Metric label="Runway" value={`${runway} ay`} tone={runway < 3 ? 'bad' : runway < 6 ? 'warn' : 'ok'} def="(Açılış bakiyesi 1,5 M ₺ + defter net nakit) / aylık gider. Konsolide (iki şirket)." hint={`Nakit ${tl(cash)}`} />
                <Metric label="DSO" value={`${dso} gün`} tone={dso > 60 ? 'warn' : 'ok'} def="Days Sales Outstanding = açık alacak / son 90 gün faturalanan × 90." />
                <Metric label="Vadesi geçen" value={tl(overdue.reduce((s, i) => s + i.amount_minor, 0))} tone={overdue.length ? 'bad' : 'ok'} def="Vadesi geçmiş ve tahsil edilmemiş fatura toplamı." hint={`${overdue.length} fatura`} />
                <Metric label="Açık alacak" value={tl(open.reduce((s, i) => s + i.amount_minor, 0))} def="Bekleyen + vadesi geçen faturalar." hint={`${open.length} fatura`} />
              </Grid>
              <Grid cols={2}>
                <Card title="Fatura durumu (₺)"><BarChart label="Fatura durumu" fmt={(n) => `${Math.round(n / 1000)}b`} data={(['paid', 'pending', 'overdue'] as const).map((s) => [s === 'paid' ? 'Ödendi' : s === 'pending' ? 'Bekliyor' : 'Gecikmiş', d.invoices.filter((i) => i.status === s).reduce((a, i) => a + i.amount_minor / 100, 0)])} /></Card>
                <Card title="Onay bekleyen gider / satın alma"><p className="text-sm">{d.expenses.filter((e) => e.status === 'pending').length} gider · {d.purchase_requests.filter((p) => p.stage === 'approval').length} satın alma onayda</p><Link className="btn btn-sm mt-3" href="/app/approvals">Onay Merkezi</Link></Card>
              </Grid>
            </div>
          );
        }
        if (t === 'quotes') {
          return <Card title="Teklifler (JS CRM ile ortak)">{d.crm_proposals.length === 0 ? <Empty>Teklif yok.</Empty> : <Table heads={['No', 'Başlık', 'Marka', 'Sürüm', 'Toplam', 'Vade', 'Durum']}>{d.crm_proposals.map((p) => <tr key={p.id}><td>{p.number}</td><td>{p.title}</td><td className="text-muted">{brandName(d.brands, p.brand_id)}</td><td>v{p.version}</td><td>{tl(proposalTotals(p.lines, p.vat_pct).total)}</td><td>{p.payment_terms_days} gün</td><td><Chip>{p.status}</Chip></td></tr>)}</Table>}<p className="mt-3 text-xs text-muted">Düzenleme için <Link className="underline" href="/app/crm?tab=proposals">JS CRM → Teklifler</Link>.</p></Card>;
        }
        if (t === 'budgets') {
          const m = projectMargins({ ...d });
          return (
            <div className="grid gap-4">
              <Card title="Bütçe ve gerçekleşen (direkt gider + işçilik)">
                {d.budgets.length === 0 ? <Empty>Bütçe yok.</Empty> : <Table heads={['Proje', 'Planlanan', 'Gerçekleşen', 'Kullanım', 'Not']}>{d.budgets.map((b) => { const r = m.find((x) => x.project.id === b.project_id); const act2 = r?.cost_minor ?? 0; const pct = b.planned_minor ? Math.round((act2 / b.planned_minor) * 100) : 0; return (
                  <tr key={b.id}><td>{d.projects.find((p) => p.id === b.project_id)?.name ?? b.project_id}</td><td>{tl(b.planned_minor)}</td><td>{tl(act2)}</td><td className="min-w-28"><Bar pct={pct} tone={toneOf(pct)} /> <span className="text-xs text-muted">%{pct}</span></td><td className="text-muted">{b.note}</td></tr>); })}</Table>}
              </Card>
              <Gate ok={can.write('budgets')} why=""><Crud kind="budgets" title="Bütçe" rows={[]} canEdit empty="" heads={[]} cells={() => []} fields={[{ name: 'project', label: 'Proje', type: 'select', options: d.projects.map((p) => [p.id, p.name]) }, { name: 'planned', label: 'Planlanan (₺)', type: 'number', def: 100000 }, { name: 'note', label: 'Not' }]}
                build={(v) => ({ project_id: String(v.project), brand_id: d.projects.find((p) => p.id === v.project)?.brand_id ?? '', planned_minor: Math.round(Number(v.planned) * 100), note: String(v.note) })} /></Gate>
            </div>
          );
        }
        if (t === 'expenses') {
          return (
            <Crud kind="expenses" title="Gider" rows={d.expenses} canEdit={exWrite} empty="Gider yok." heads={['Tarih', 'Kategori', 'Proje', 'Tutar', 'Tedarikçi', 'Şirket', 'Durum']}
              cells={(r) => [fmtDate(r.date), r.category, d.projects.find((p) => p.id === r.project_id)?.name ?? '—', tl(r.amount_minor), supplier(r.supplier_id), COMPANIES.find((c) => c[0] === r.company)?.[1] ?? r.company, <Chip key="s" tone={EXP_TONE[r.status]}>{r.status}</Chip>]}
              rowActions={(r) => r.status === 'pending' ? <><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('expenses', { id: r.id, status: 'approved' }))}>Onayla</button> </> : r.status === 'approved' ? <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('expenses', { id: r.id, status: 'paid' }))}>Ödendi</button> : null}
              fields={[{ name: 'cat', label: 'Kategori', required: true }, { name: 'project', label: 'Proje', type: 'select', options: [['', '—'], ...d.projects.map((p) => [p.id, p.name] as [string, string])] }, { name: 'amount', label: 'Tutar (₺)', type: 'number', def: 1000 }, { name: 'sup', label: 'Tedarikçi', type: 'select', options: [['', '—'], ...d.suppliers.map((s) => [s.id, s.name] as [string, string])] }, { name: 'date', label: 'Tarih', type: 'date', def: today }, { name: 'co', label: 'Şirket', type: 'select', options: COMPANIES }, { name: 'note', label: 'Not' }]}
              build={(v) => ({ project_id: v.project ? String(v.project) : null, brand_id: d.projects.find((p) => p.id === v.project)?.brand_id ?? null, category: String(v.cat), amount_minor: Math.round(Number(v.amount) * 100), supplier_id: v.sup ? String(v.sup) : null, date: String(v.date), status: 'pending' as const, note: String(v.note), company: String(v.co) })} />
          );
        }
        if (t === 'purchasing') {
          const STAGES = [['request', 'Talep'], ['compare', 'Karşılaştırma'], ['approval', 'Onay'], ['ordered', 'Sipariş']] as const;
          return (
            <div className="grid gap-4">{Err}
              <Grid cols={2}>
                {d.purchase_requests.map((p) => {
                  const approval = approvals.find((a) => a.id === p.approval_id); const best = [...p.quotes].sort((a, b) => a.amount_minor - b.amount_minor)[0];
                  const stageIdx = STAGES.findIndex(([s]) => s === p.stage);
                  return (
                    <Card key={p.id} title={p.title} aside={<Chip tone="brand">{STAGES[stageIdx][1]}</Chip>}>
                      <ol className="mb-3 flex gap-1" aria-label="Aşama">{STAGES.map(([s], i) => <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? 'bg-accent' : 'bg-nested'}`} />)}</ol>
                      <p className="text-xs text-muted">{d.projects.find((x) => x.id === p.project_id)?.name ?? '—'} · talep eden {nameOf(d.team, p.requested_by).split(' ')[0]}</p>
                      {p.quotes.length > 0 && <Table heads={['Tedarikçi', 'Teklif', 'Süre']}>{p.quotes.map((qt) => <tr key={qt.supplier_id}><td>{supplier(qt.supplier_id)} {best?.supplier_id === qt.supplier_id && <Chip tone="ok">en düşük</Chip>}</td><td>{tl(qt.amount_minor)}</td><td>{qt.days} gün</td></tr>)}</Table>}
                      {approval && <p className="mt-2 text-xs">Onay: <Chip tone={approval.status === 'approved' ? 'ok' : approval.status === 'rejected' ? 'bad' : 'warn'}>{approval.status}</Chip></p>}
                      {exWrite && <div className="mt-3 flex flex-wrap gap-2">
                        {p.stage === 'request' && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('purchase_requests', { id: p.id, stage: 'compare' }))}>Karşılaştırmaya al</button>}
                        {p.stage === 'compare' && p.quotes.length > 0 && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act(async () => {
                          const a = await repo!.createApproval({ action_type: 'budget', title: `Satın alma: ${p.title} (${money(best.amount_minor)})`, subject: { project_id: p.project_id ?? undefined, amount_minor: best.amount_minor }, required_role: best.amount_minor >= 5000000 ? 'owner' : 'pm', due_at: addDays(today, 3) });
                          await repo!.save('purchase_requests', { id: p.id, stage: 'approval', chosen_supplier: best.supplier_id, amount_minor: best.amount_minor, approval_id: a.id });
                        })}>{supplier(best.supplier_id)} seç ve onaya gönder</button>}
                        {p.stage === 'approval' && <button className="btn btn-sm" disabled={busy || approval?.status !== 'approved'} title={approval?.status !== 'approved' ? 'Önce onay gerekli' : ''} onClick={() => void act(() => repo!.save('purchase_requests', { id: p.id, stage: 'ordered' }))}>Sipariş ver</button>}
                      </div>}
                    </Card>
                  );
                })}
              </Grid>
              {d.purchase_requests.length === 0 && <Empty>Satın alma talebi yok.</Empty>}
              {exWrite && <FormCard title="Yeni talep" busy={busy} fields={[{ name: 'title', label: 'Talep', required: true }, { name: 'project', label: 'Proje', type: 'select', options: d.projects.map((p) => [p.id, p.name]) }, { name: 'sup', label: 'Tedarikçi', type: 'select', options: d.suppliers.filter((s) => s.status === 'active').map((s) => [s.id, s.name]) }, { name: 'amount', label: 'Teklif tutarı (₺)', type: 'number', def: 10000 }, { name: 'days', label: 'Teslim (gün)', type: 'number', def: 3 }]}
                onSubmit={(v) => act(() => repo!.save('purchase_requests', { title: String(v.title), project_id: String(v.project), amount_minor: Math.round(Number(v.amount) * 100), stage: 'request', requested_by: me?.employee_id ?? 'BA', chosen_supplier: null, approval_id: null, quotes: v.sup ? [{ supplier_id: String(v.sup), amount_minor: Math.round(Number(v.amount) * 100), days: Number(v.days) }] : [] }))} />}
            </div>
          );
        }
        if (t === 'suppliers') {
          return <Crud kind="suppliers" title="Tedarikçi" rows={d.suppliers} canEdit={exWrite} empty="Tedarikçi yok." heads={['Ad', 'Kategori', 'İletişim', 'Puan', 'Vade', 'Durum']}
            cells={(r) => [<strong key="n">{r.name}</strong>, r.category, `${r.contact} · ${r.email}`, '★'.repeat(r.rating), `${r.terms_days} gün`, <Chip key="s" tone={r.status === 'active' ? 'ok' : 'bad'}>{r.status === 'active' ? 'Aktif' : 'Engelli'}</Chip>]}
            fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'cat', label: 'Kategori' }, { name: 'contact', label: 'Kişi' }, { name: 'email', label: 'E-posta', type: 'email' }, { name: 'rating', label: 'Puan', type: 'number', def: 3 }, { name: 'terms', label: 'Vade (gün)', type: 'number', def: 30 }]}
            build={(v) => ({ name: String(v.name), category: String(v.cat), contact: String(v.contact), email: String(v.email), rating: Number(v.rating), terms_days: Number(v.terms), status: 'active' as const })} />;
        }
        if (t === 'invoices') {
          const buckets = [['0–30', 0, 30], ['31–60', 31, 60], ['60+', 61, 9999]] as const;
          const age = (i: { due_at: string }) => Math.max(0, Math.round((new Date(today).getTime() - new Date(i.due_at).getTime()) / 86400000));
          return (
            <div className="grid gap-4">{Err}
              <Card title="Yaşlandırma (vadesi geçen)"><div className="grid grid-cols-3 gap-3">{buckets.map(([l, a, b]) => <div key={l} className="nested text-center"><div className="text-xs text-muted">{l} gün</div><div className="text-xl font-bold">{tl(d.invoices.filter((i) => i.status === 'overdue' && age(i) >= a && age(i) <= b).reduce((s, i) => s + i.amount_minor, 0))}</div></div>)}</div></Card>
              <Card title="Faturalar & tahsilat">
                {d.invoices.length === 0 ? <Empty>Fatura yok.</Empty> : <Table heads={['No', 'Marka', 'Tutar', 'Kesim', 'Vade', 'Durum', '']}>{d.invoices.map((i) => (
                  <tr key={i.id}><td>{i.number}</td><td>{brandName(d.brands, i.brand_id)}</td><td>{tl(i.amount_minor)}</td><td>{fmtDate(i.issued_at)}</td><td>{fmtDate(i.due_at)}</td>
                    <td><Chip tone={i.status === 'paid' ? 'ok' : i.status === 'overdue' ? 'bad' : 'warn'}>{i.status === 'paid' ? 'Tahsil edildi' : i.status === 'overdue' ? `${age(i)} gün gecikti` : 'Bekliyor'}</Chip></td>
                    <td>{write && i.status !== 'paid' && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('invoices', { id: i.id, status: 'paid', paid_at: today }))}>Tahsil edildi</button>}</td></tr>))}</Table>}
              </Card>
              <Gate ok={write} why=""><FormCard title="Yeni fatura" busy={busy} fields={[{ name: 'brand', label: 'Marka', type: 'select', options: d.brands.map((b) => [b.id, b.name]) }, { name: 'no', label: 'Fatura no', required: true, def: `FTR-2026-0${200 + d.invoices.length}` }, { name: 'amount', label: 'Tutar (₺)', type: 'number', def: 10000 }, { name: 'terms', label: 'Vade (gün)', type: 'number', def: 30 }]}
                onSubmit={(v) => act(() => repo!.save('invoices', { brand_id: String(v.brand), project_id: null, number: String(v.no), amount_minor: Math.round(Number(v.amount) * 100), status: 'pending', issued_at: today, due_at: addDays(today, Number(v.terms)), paid_at: null }))} /></Gate>
            </div>
          );
        }
        if (t === 'margin') {
          const rows = projectMargins({ ...d });
          return (
            <div className="grid gap-4">
              <Card title="Marj formülü"><p className="text-sm"><code>Marj = Gelir − (Σ saat × saatlik maliyet + direkt gider)</code></p><p className="mt-2 text-xs text-muted">{MARGIN_EXPLAIN}</p></Card>
              <Card title="Proje marjı (toplulaştırılmış)">
                <Table heads={['Proje', 'Gelir', 'Saat', 'İşçilik', 'Direkt gider', 'Marj', 'Marj %']}>{rows.map((r) => <tr key={r.project.id}><td>{r.project.name}</td><td>{tl(r.project.budget_minor)}</td><td>{Math.round(r.hours * 10) / 10}</td><td>{tl(r.labor_minor)}</td><td>{tl(r.direct_minor)}</td><td className={r.margin_minor < 0 ? 'text-magenta' : ''}>{tl(r.margin_minor)}</td><td><Chip tone={r.margin_pct < 20 ? 'bad' : r.margin_pct < 35 ? 'warn' : 'ok'}>%{r.margin_pct}</Chip></td></tr>)}</Table>
              </Card>
            </div>
          );
        }
        const rows = co === 'all' ? d.ledger_entries : d.ledger_entries.filter((e) => e.company === co);
        const inter = rows.filter((e) => e.kind === 'intercompany').reduce((s, e) => s + e.amount_minor, 0);
        return (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Şirket"><button className="btn btn-sm" aria-pressed={co === 'all'} onClick={() => setCo('all')}>Konsolide</button>{COMPANIES.map(([id, n]) => <button key={id} className="btn btn-sm" aria-pressed={co === id} onClick={() => setCo(id)}>{n}</button>)}</div>
            <Grid cols={3}>
              <Metric label="Gelir" value={tl(rows.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount_minor, 0))} def="Defterdeki gelir kayıtları." />
              <Metric label="Gider" value={tl(rows.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount_minor, 0))} def="Defterdeki gider kayıtları." />
              <Metric label="Net" value={tl(ledgerNet(rows))} tone={ledgerNet(rows) < 0 ? 'bad' : 'ok'} def="Gelir − gider. Şirketler arası kalemler konsolidasyonda elenir." hint={co === 'all' ? `Eleme: ${tl(inter / 2)} (şirketler arası iki yönlü kayıt)` : undefined} />
            </Grid>
            <Card title={co === 'all' ? 'Konsolide defter' : COMPANIES.find((c) => c[0] === co)?.[1]}>
              <Table heads={['Tarih', 'Şirket', 'Tür', 'Hesap', 'Tutar', 'Not']} empty={rows.length ? undefined : 'Kayıt yok.'}>{rows.map((e) => <tr key={e.id}><td>{fmtDate(e.date)}</td><td>{COMPANIES.find((c) => c[0] === e.company)?.[1]}</td><td><Chip tone={e.kind === 'income' ? 'ok' : e.kind === 'expense' ? 'bad' : undefined}>{e.kind === 'intercompany' ? 'şirketler arası' : e.kind === 'income' ? 'gelir' : 'gider'}</Chip></td><td>{e.account}</td><td>{tl(e.amount_minor)}</td><td className="text-muted">{e.memo}</td></tr>)}</Table>
            </Card>
            <Gate ok={write} why=""><Crud kind="ledger_entries" title="Defter kaydı" rows={[]} canEdit empty="" heads={[]} cells={() => []} fields={[{ name: 'co', label: 'Şirket', type: 'select', options: COMPANIES }, { name: 'kind', label: 'Tür', type: 'select', options: [['income', 'Gelir'], ['expense', 'Gider'], ['intercompany', 'Şirketler arası']] }, { name: 'acc', label: 'Hesap', required: true }, { name: 'amount', label: 'Tutar (₺)', type: 'number', def: 1000 }, { name: 'memo', label: 'Not' }]}
              build={(v) => ({ company: String(v.co), date: today, kind: String(v.kind) as 'income', account: String(v.acc), amount_minor: Math.round(Number(v.amount) * 100), memo: String(v.memo) })} /></Gate>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}
