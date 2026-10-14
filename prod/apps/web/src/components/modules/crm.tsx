'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DEAL_STAGES, DEAL_STAGE_LABELS, type Deal, type DealStage, type Proposal, type QuoteLine } from '@jscore/contracts';
import { Empty, fmtDate, money, todayFor } from '../ui';
import { useSession } from '../session';
import { Await, Bar, Card, Chip, Crud, FormCard, Gate, Grid, Kanban, Metric, ModulePage, Table, brandName, nameOf, tl, toneOf, useAct, useCan, useWorld } from '../mod';
import { accountHealth, bumpProposal, contractUsage, dueDateFor, proposalTotals, surveyStats } from '@/lib/domain';
import { usedThisMonth } from '@/lib/quota';

const TABS: Array<[string, string]> = [['pipeline', 'Pipeline'], ['accounts', 'Müşteriler & Markalar'], ['contacts', 'Kişiler'], ['proposals', 'Teklifler'], ['contracts', 'Sözleşmeler & yenilemeler']];
const STAGES = DEAL_STAGES.map((s) => [s, DEAL_STAGE_LABELS[s]] as [string, string]);
const STATUS: Record<string, [string, 'ok' | 'bad' | 'warn']> = { active: ['Aktif', 'ok'], risky: ['Riskli', 'bad'], prospect: ['Aday', 'warn'] };

export function CrmView({ tab }: { tab?: string }) {
  const { mode, repo } = useSession();
  const can = useCan();
  const q = useWorld(['crm_deals', 'crm_contacts', 'crm_proposals', 'crm_contracts']);
  const { act, busy, Err } = useAct();
  const [sel, setSel] = useState<string>('');
  const today = todayFor(mode);
  return (
    <ModulePage id="crm" title="JS CRM" sub="Pipeline, müşteriler, teklifler ve sözleşmeler" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const team = d.team; const write = can.write('crm_deals');
        if (t === 'pipeline') {
          const open = d.crm_deals.filter((x) => x.stage !== 'won' && x.stage !== 'lost');
          const won = d.crm_deals.filter((x) => x.stage === 'won');
          return (
            <div className="grid gap-4">{Err}
              <Grid cols={3}>
                <Metric label="Açık pipeline" value={tl(open.reduce((s, x) => s + x.value_minor, 0))} def="Yeni, Görüşme ve Teklif aşamasındaki fırsatların toplam tutarı." hint={`${open.length} fırsat`} />
                <Metric label="Kazanılan" value={tl(won.reduce((s, x) => s + x.value_minor, 0))} tone="ok" def="Kazanıldı aşamasındaki fırsatların toplamı." />
                <Metric label="Kazanma oranı" value={`%${d.crm_deals.filter((x) => x.stage === 'won' || x.stage === 'lost').length ? Math.round((won.length / d.crm_deals.filter((x) => x.stage === 'won' || x.stage === 'lost').length) * 100) : 0}`} def="Kazanılan / (kazanılan + kaybedilen) fırsat sayısı." />
              </Grid>
              <Kanban<Deal> items={d.crm_deals} stages={STAGES} stageOf={(x) => x.stage} readonly={!write}
                onMove={async (x, to) => { await repo!.moveDeal(x.id, to as DealStage); }}
                render={(x) => (<><div className="text-[13px] font-semibold leading-snug">{x.title}</div><div className="mt-1 text-xs text-muted">{x.company}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5"><Chip>{tl(x.value_minor)}</Chip><Chip>{nameOf(team, x.owner).split(' ')[0]}</Chip></div><div className="mt-1 text-[11px] text-muted">{x.next_step}</div></>)} />
              {!write && <p className="text-xs text-muted">Kartları taşıma yetkin yok (salt okunur).</p>}
              <Gate ok={write} why=""><FormCard title="Yeni fırsat" busy={busy} fields={[
                { name: 'company', label: 'Şirket', required: true }, { name: 'title', label: 'Başlık', required: true }, { name: 'value', label: 'Tutar (₺)', type: 'number', def: 100000 },
                { name: 'owner', label: 'Sahip', type: 'select', options: team.map((m) => [m.id, m.name]) }, { name: 'source', label: 'Kaynak', def: 'Web formu' }, { name: 'next', label: 'Sonraki adım' }]}
                onSubmit={(v) => act(() => repo!.save('crm_deals', { brand_id: null, company: String(v.company), title: String(v.title), stage: 'new', value_minor: Math.round(Number(v.value) * 100), owner: String(v.owner), source: String(v.source), next_step: String(v.next) }))} /></Gate>
            </div>
          );
        }
        if (t === 'accounts') {
          return (
            <Card title={`Müşteriler & Markalar (${d.brands.length})`}>
              <Table heads={['Marka', 'Sektör', 'Durum', 'Account', 'Art Director', 'Sağlık', 'Uyumluluk']}>
                {d.brands.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="font-semibold hover:underline" href={`/app/crm/${b.id}`}>{b.name}</Link></td><td className="text-muted">{b.sector}</td>
                    <td><Chip tone={STATUS[b.status][1]}>{STATUS[b.status][0]}</Chip></td><td>{nameOf(team, b.account_owner).split(' ')[0]}</td><td>{nameOf(team, b.art_director).split(' ')[0]}</td>
                    <td className="min-w-24"><Bar pct={b.health} tone={b.health < 55 ? 'bad' : b.health < 70 ? 'warn' : 'ok'} /></td>
                    <td>{b.compliance_flags.length ? b.compliance_flags.map((f) => <Chip key={f} tone="warn">{f}</Chip>) : <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          );
        }
        if (t === 'contacts') {
          return <Crud kind="crm_contacts" title="Kişi" rows={d.crm_contacts} canEdit={write} empty="Kişi yok." heads={['Ad', 'Marka', 'Ünvan', 'E-posta', 'Telefon']}
            cells={(r) => [<strong key="n">{r.name}{r.primary ? ' ★' : ''}</strong>, brandName(d.brands, r.brand_id), r.title, r.email, r.phone]}
            fields={[{ name: 'brand', label: 'Marka', type: 'select', options: d.brands.map((b) => [b.id, b.name]) }, { name: 'name', label: 'Ad soyad', required: true }, { name: 'title', label: 'Ünvan' }, { name: 'email', label: 'E-posta', type: 'email' }, { name: 'phone', label: 'Telefon' }, { name: 'primary', label: 'Birincil kişi', type: 'checkbox' }]}
            build={(v) => ({ brand_id: String(v.brand), name: String(v.name), title: String(v.title), email: String(v.email), phone: String(v.phone), primary: !!v.primary, client_visible: true })} />;
        }
        if (t === 'proposals') {
          const cur = d.crm_proposals.find((p) => p.id === sel);
          return (
            <div className="grid gap-4">{Err}
              <Card title="Teklifler" aside={write && <button className="btn btn-sm" onClick={() => setSel('new')}>Yeni teklif</button>}>
                {d.crm_proposals.length === 0 ? <Empty>Teklif yok.</Empty> : (
                  <Table heads={['No', 'Başlık', 'Marka', 'Sürüm', 'Toplam', 'Durum', '']}>
                    {d.crm_proposals.map((p) => (
                      <tr key={p.id}><td>{p.number}</td><td>{p.title}</td><td className="text-muted">{brandName(d.brands, p.brand_id)}</td><td>v{p.version}</td><td>{tl(proposalTotals(p.lines, p.vat_pct).total)}</td>
                        <td><Chip tone={p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'bad' : undefined}>{p.status}</Chip></td><td><button className="btn btn-sm" onClick={() => setSel(p.id)}>Aç</button></td></tr>
                    ))}
                  </Table>
                )}
              </Card>
              {(cur || sel === 'new') && <ProposalEditor key={sel} proposal={cur} brands={d.brands} deals={d.crm_deals} today={today} canEdit={write} busy={busy} onSave={(p) => act(() => (p.id ? repo!.save('crm_proposals', p as never) : repo!.save('crm_proposals', p as never)))} number={`TKL-2026-${String(40 + d.crm_proposals.length + 1).padStart(3, '0')}`} />}
            </div>
          );
        }
        const month = new Date(`${today}T12:00:00Z`);
        const pb = Object.fromEntries(d.projects.map((p) => [p.id, p.brand_id]));
        return (
          <div className="grid gap-4">{Err}
            {d.crm_contracts.length === 0 ? <Empty>Sözleşme yok.</Empty> : d.crm_contracts.map((c) => {
              const used = usedThisMonth(d.tasks, pb, c.brand_id, month);
              const u = contractUsage(c, used); const days = Math.round((new Date(c.end).getTime() - month.getTime()) / 86400000);
              return (
                <Card key={c.id} title={c.title} aside={<span className="flex gap-2"><Chip tone={c.status === 'expiring' ? 'warn' : 'ok'}>{c.status === 'expiring' ? `Yenileme ${days} gün` : 'Aktif'}</Chip>{c.auto_renew && <Chip>Otomatik yenileme</Chip>}</span>}>
                  <p className="mb-3 text-xs text-muted">{brandName(d.brands, c.brand_id)} · {c.type === 'retainer' ? 'Aylık retainer' : 'Proje'} · {fmtDate(c.start)} → {fmtDate(c.end)} · {money(c.monthly_fee_minor)}/ay</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><div className="label">Dahil haklar (bu ay kota kullanımı)</div>{u.rights.map((r) => <div key={r.key} className="mb-2"><div className="flex justify-between text-xs"><span>{r.key}</span><span className={r.over ? 'text-magenta' : ''}>{r.used}/{r.limit}{r.over ? ' · kota aşıldı' : ''}</span></div><Bar pct={r.pct} tone={toneOf(r.pct)} /></div>)}</div>
                    <div><div className="label">Revize sınırı</div><div className="flex justify-between text-xs"><span>Tur</span><span className={u.revision.over ? 'text-magenta' : ''}>{u.revision.used}/{u.revision.limit}</span></div><Bar pct={u.revision.pct} tone={u.revision.pct >= 100 ? 'bad' : toneOf(u.revision.pct)} />{u.revision.pct >= 100 && <p className="mt-1 text-xs text-magenta">Sınır doldu; ek tur kapsam dışı onayına düşer.</p>}</div>
                  </div>
                  {write && <div className="mt-3 flex gap-2"><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('crm_contracts', { id: c.id, auto_renew: !c.auto_renew }))}>{c.auto_renew ? 'Otomatik yenilemeyi kapat' : 'Otomatik yenilemeyi aç'}</button></div>}
                </Card>
              );
            })}
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

function ProposalEditor({ proposal, brands, deals, today, canEdit, busy, onSave, number }: {
  proposal?: Proposal; brands: Array<{ id: string; name: string }>; deals: Deal[]; today: string; canEdit: boolean; busy: boolean; onSave: (p: Record<string, unknown>) => Promise<unknown>; number: string;
}) {
  const [lines, setLines] = useState<QuoteLine[]>(proposal?.lines ?? [{ desc: '', qty: 1, unit_minor: 0 }]);
  const [meta, setMeta] = useState({ title: proposal?.title ?? '', brand_id: proposal?.brand_id ?? brands[0]?.id ?? '', vat: proposal?.vat_pct ?? 20, terms: proposal?.payment_terms_days ?? 30, valid: proposal?.valid_until ?? today, deal: proposal?.deal_id ?? '' });
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const tot = proposalTotals(lines, meta.vat);
  const setLine = (i: number, patch: Partial<QuoteLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const base = () => ({ brand_id: meta.brand_id, deal_id: meta.deal || null, title: meta.title, vat_pct: meta.vat, payment_terms_days: meta.terms, valid_until: meta.valid, lines: lines.filter((l) => l.desc.trim()) });
  const save = (newVersion: boolean) => {
    if (!proposal) return onSave({ ...base(), number, version: 1, status: 'draft', history: [{ version: 1, total_minor: tot.total, at: today }] });
    const patch = newVersion ? bumpProposal({ ...proposal, ...base() }, today) : {};
    return onSave({ id: proposal.id, ...base(), ...patch });
  };
  const pdf = async () => {
    setPdfErr(null);
    try {
      const res = await fetch('/api/pdf/proposal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand: brands.find((b) => b.id === meta.brand_id)?.name, proposal: { ...base(), number: proposal?.number ?? number, version: proposal?.version ?? 1, status: proposal?.status ?? 'draft', history: proposal?.history ?? [] } }) });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'PDF üretilemedi');
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = url; a.download = `${proposal?.number ?? number}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) { setPdfErr(e instanceof Error ? e.message : 'PDF hatası'); }
  };
  return (
    <Card title={proposal ? `${proposal.number} · v${proposal.version}` : `Yeni teklif · ${number}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="p_title">Başlık</label><input id="p_title" className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} disabled={!canEdit} /></div>
        <div><label className="label" htmlFor="p_brand">Marka</label><select id="p_brand" className="input" value={meta.brand_id} onChange={(e) => setMeta({ ...meta, brand_id: e.target.value })} disabled={!canEdit}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label" htmlFor="p_deal">Fırsat</label><select id="p_deal" className="input" value={meta.deal} onChange={(e) => setMeta({ ...meta, deal: e.target.value })} disabled={!canEdit}><option value="">—</option>{deals.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>
        <div className="grid grid-cols-3 gap-2"><div><label className="label" htmlFor="p_vat">KDV %</label><input id="p_vat" type="number" className="input" value={meta.vat} onChange={(e) => setMeta({ ...meta, vat: Number(e.target.value) })} disabled={!canEdit} /></div><div><label className="label" htmlFor="p_terms">Vade (gün)</label><input id="p_terms" type="number" className="input" value={meta.terms} onChange={(e) => setMeta({ ...meta, terms: Number(e.target.value) })} disabled={!canEdit} /></div><div><label className="label" htmlFor="p_valid">Geçerlilik</label><input id="p_valid" type="date" className="input" value={meta.valid} onChange={(e) => setMeta({ ...meta, valid: e.target.value })} disabled={!canEdit} /></div></div>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="table"><thead><tr><th>Kalem</th><th>Adet</th><th>Birim (₺)</th><th className="text-right">Tutar</th><th /></tr></thead><tbody>
        {lines.map((l, i) => (
          <tr key={i}><td><input className="input" aria-label={`Kalem ${i + 1}`} value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} disabled={!canEdit} /></td>
            <td><input className="input w-20" type="number" aria-label="Adet" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} disabled={!canEdit} /></td>
            <td><input className="input w-32" type="number" aria-label="Birim fiyat" value={l.unit_minor / 100} onChange={(e) => setLine(i, { unit_minor: Math.round(Number(e.target.value) * 100) })} disabled={!canEdit} /></td>
            <td className="text-right">{tl(Math.round(l.qty * l.unit_minor))}</td><td>{canEdit && lines.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Kalemi sil">×</button>}</td></tr>
        ))}</tbody></table></div>
      {canEdit && <button className="btn btn-sm mt-2" onClick={() => setLines([...lines, { desc: '', qty: 1, unit_minor: 0 }])}>+ Kalem</button>}
      <dl className="mt-4 grid max-w-xs gap-1 text-sm"><div className="flex justify-between"><dt className="text-muted">Ara toplam</dt><dd>{tl(tot.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-muted">KDV %{meta.vat}</dt><dd>{tl(tot.vat)}</dd></div><div className="flex justify-between font-bold"><dt>Toplam</dt><dd>{tl(tot.total)}</dd></div><div className="flex justify-between text-xs text-muted"><dt>Vade tarihi</dt><dd>{fmtDate(dueDateFor(meta.valid, meta.terms))}</dd></div></dl>
      {proposal && proposal.history.length > 0 && <p className="mt-3 text-xs text-muted">Sürüm geçmişi: {proposal.history.map((h) => `v${h.version} ${tl(h.total_minor)} (${fmtDate(h.at)})`).join(' → ')}</p>}
      {pdfErr && <p role="alert" className="mt-2 text-sm text-magenta">{pdfErr}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && <button className="btn btn-primary btn-sm" disabled={busy || !meta.title || lines.every((l) => !l.desc.trim())} onClick={() => void save(false)}>{proposal ? 'Kaydet' : 'Taslak oluştur'}</button>}
        {canEdit && proposal && <button className="btn btn-sm" disabled={busy} onClick={() => void save(true)}>Yeni sürüm (v{proposal.version + 1})</button>}
        {canEdit && proposal && ['sent', 'accepted', 'rejected'].map((s) => <button key={s} className="btn btn-ghost btn-sm" disabled={busy || proposal.status === s} onClick={() => void onSave({ id: proposal.id, status: s })}>{s === 'sent' ? 'Gönderildi' : s === 'accepted' ? 'Kabul' : 'Ret'}</button>)}
        <button className="btn btn-sm" onClick={() => void pdf()}>PDF indir</button>
      </div>
    </Card>
  );
}

export function Account360({ brandId }: { brandId: string }) {
  const { mode } = useSession();
  const q = useWorld(['crm_contacts', 'crm_contracts', 'invoices', 'survey_responses', 'surveys']);
  const today = todayFor(mode);
  return (
    <ModulePage id="crm" title="Account 360" tabs={[['360', 'Hesap özeti']]} tab="360" actions={<Link className="btn btn-sm" href="/app/crm?tab=accounts">← Markalar</Link>}>
      {() => <Await q={q}>{(d) => {
        const b = d.brands.find((x) => x.id === brandId);
        if (!b) return <Empty>Marka bulunamadı veya görünür değil.</Empty>;
        const projects = d.projects.filter((p) => p.brand_id === b.id); const pids = new Set(projects.map((p) => p.id));
        const open = d.tasks.filter((t) => pids.has(t.project_id) && t.state !== 'archive');
        const late = open.filter((t) => t.due_at.slice(0, 10) < today).length;
        const inv = d.invoices.filter((i) => i.brand_id === b.id); const overdue = inv.filter((i) => i.status === 'overdue').length;
        const csatSurvey = d.surveys.find((s) => s.kind === 'csat'); const resp = d.survey_responses.filter((r) => r.brand_id === b.id && r.survey_id === csatSurvey?.id);
        const csat = surveyStats('csat', resp).value; const health = accountHealth(b.health, { overdueTasks: late, overdueInvoices: overdue, csat });
        return (
          <div className="grid gap-4">
            <Grid cols={4}>
              <Metric label="Sağlık skoru" value={health} tone={health < 55 ? 'bad' : health < 70 ? 'warn' : 'ok'} def={`Marka bazı (${b.health}) − geciken görev × 4 − geciken fatura × 6 ± CSAT sapması (4 üzeri +5/puan).`} />
              <Metric label="Memnuniyet (CSAT)" value={resp.length ? csat : '—'} tone={resp.length && csat < 4 ? 'warn' : 'ok'} def="Teslim sonrası anket cevaplarının ortalaması (1–5)." hint={`${resp.length} cevap`} />
              <Metric label="Açık görev" value={open.length} hint={`${late} gecikmiş`} tone={late ? 'bad' : undefined} def="Arşivlenmemiş görev sayısı." />
              <Metric label="Geciken fatura" value={overdue} tone={overdue ? 'bad' : 'ok'} def="Vadesi geçmiş ve ödenmemiş fatura sayısı." />
            </Grid>
            <Card title={b.name} aside={<Chip tone={STATUS[b.status][1]}>{STATUS[b.status][0]}</Chip>}>
              <p className="text-sm text-muted">{b.sector} · Account: {nameOf(d.team, b.account_owner)} · AD: {nameOf(d.team, b.art_director)}</p>
              {b.compliance_flags.length > 0 && <p className="mt-2">{b.compliance_flags.map((f) => <Chip key={f} tone="warn">{f}</Chip>)}</p>}
            </Card>
            <Card title="Projeler">{projects.length === 0 ? <Empty>Proje yok.</Empty> : <Table heads={['Proje', 'Durum', 'Teslim', 'Bütçe']}>{projects.map((p) => <tr key={p.id}><td><Link className="font-semibold hover:underline" href={`/app/projects/${p.id}`}>{p.name}</Link></td><td>{p.status}</td><td>{fmtDate(p.due_at)}</td><td>{money(p.budget_minor)}</td></tr>)}</Table>}</Card>
            <Card title="Açık görevler">{open.length === 0 ? <Empty>Açık görev yok.</Empty> : <ul className="grid gap-2">{open.slice(0, 8).map((t) => <li key={t.id} className="nested flex justify-between gap-2 text-sm"><span>{t.title}</span><Chip tone={t.due_at.slice(0, 10) < today ? 'bad' : undefined}>{fmtDate(t.due_at)}</Chip></li>)}</ul>}</Card>
            <Grid cols={2}>
              <Card title="Kişiler">{d.crm_contacts.filter((c) => c.brand_id === b.id).map((c) => <p key={c.id} className="text-sm">{c.name} <span className="text-muted">· {c.title} · {c.email}</span></p>)}</Card>
              <Card title="Sözleşme">{d.crm_contracts.filter((c) => c.brand_id === b.id).map((c) => <p key={c.id} className="text-sm">{c.title} <span className="text-muted">· {fmtDate(c.end)} bitiş</span></p>)}{!d.crm_contracts.some((c) => c.brand_id === b.id) && <span className="text-sm text-muted">Sözleşme kaydı yok.</span>}</Card>
            </Grid>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}
