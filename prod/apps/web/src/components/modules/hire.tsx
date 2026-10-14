'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CANDIDATE_STAGES, CANDIDATE_STAGE_LABELS, ROLE_LABELS, ROLES, type Candidate, type CandidateStage } from '@jscore/contracts';
import { Empty, fmtDate, fmtTime, todayFor } from '../ui';
import { useSession } from '../session';
import { Await, Card, Chip, Crud, CsvButton, FormCard, Grid, Kanban, Metric, ModulePage, Table, nameOf, useAct, useCan, useWorld } from '../mod';
import { Donut, Funnel } from '../charts';

const TABS: Array<[string, string]> = [['dashboard', 'ATS Dashboard'], ['jobs', 'Jobs'], ['candidates', 'Candidates'], ['talent', 'Talent pool'], ['reports', 'Reports']];
const KINDS = ['jobs', 'candidates', 'interviews', 'offers'] as const;
const BOARD: Array<[string, string]> = (['applied', 'interview', 'case', 'offer'] as const).map((s) => [s, CANDIDATE_STAGE_LABELS[s]]);

function useIngest() {
  const { repo, bump } = useSession(); const done = useRef(false);
  useEffect(() => { if (!repo || done.current) return; done.current = true; void repo.ingestApplications().then((n) => { if (n > 0) bump(); }, () => undefined); }, [repo, bump]);
}

export function HireView({ tab }: { tab?: string }) {
  const { repo, mode } = useSession();
  const can = useCan();
  useIngest();
  const q = useWorld(KINDS);
  const { act, busy, Err } = useAct();
  const [job, setJob] = useState('');
  const write = can.write('candidates');
  const today = todayFor(mode);
  return (
    <ModulePage id="hire" title="JS Hire" sub="ATS: pozisyonlar, adaylar, teklif ve işe alım" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const jobName = (id: string) => d.jobs.find((j) => j.id === id)?.title ?? '—';
        const active = d.candidates.filter((c) => c.stage !== 'rejected' && c.stage !== 'hired');
        if (t === 'dashboard') {
          return (
            <div className="grid gap-4">
              <Grid cols={4}>
                <Metric label="Açık pozisyon" value={d.jobs.filter((j) => j.status === 'open').length} def="Durumu 'open' olan ilanlar." />
                <Metric label="Aktif aday" value={active.length} def="Elenmemiş ve işe alınmamış adaylar." />
                <Metric label="Bekleyen teklif" value={d.offers.filter((o) => o.status === 'sent' || o.status === 'draft').length} def="Gönderilmiş veya taslak teklifler." />
                <Metric label="İşe alınan" value={d.candidates.filter((c) => c.stage === 'hired').length} tone="ok" def="Teklifi kabul edip People'a aktarılan adaylar." />
              </Grid>
              <Card title="Huni"><Funnel steps={[['Başvuru', d.candidates.length], ['Görüşme', d.candidates.filter((c) => ['interview', 'case', 'offer', 'hired'].includes(c.stage)).length], ['Case', d.candidates.filter((c) => ['case', 'offer', 'hired'].includes(c.stage)).length], ['Teklif', d.candidates.filter((c) => ['offer', 'hired'].includes(c.stage)).length], ['İşe alındı', d.candidates.filter((c) => c.stage === 'hired').length]]} /></Card>
              <Card title="Yaklaşan görüşmeler">{d.interviews.filter((i) => i.at.slice(0, 10) >= today).length === 0 ? <Empty>Planlı görüşme yok.</Empty> : <Table heads={['Aday', 'Zaman', 'Görüşmeci', 'Tür']}>{d.interviews.filter((i) => i.at.slice(0, 10) >= today).map((i) => <tr key={i.id}><td>{d.candidates.find((c) => c.id === i.candidate_id)?.name}</td><td>{fmtTime(i.at)}</td><td>{nameOf(d.team, i.interviewer)}</td><td>{i.kind}</td></tr>)}</Table>}</Card>
            </div>
          );
        }
        if (t === 'jobs') {
          return <Crud kind="jobs" title="Pozisyon" rows={d.jobs} canEdit={write} empty="Pozisyon yok." heads={['Pozisyon', 'Departman', 'Konum', 'Aday', 'Başvuru linki', 'Durum']}
            cells={(r) => [<strong key="n">{r.title}</strong>, r.dept, r.location, d.candidates.filter((c) => c.job_id === r.id).length, <Link key="l" className="underline" href={`/apply/${r.slug}`} target="_blank">/apply/{r.slug}</Link>, <Chip key="s" tone={r.status === 'open' ? 'ok' : undefined}>{r.status}</Chip>]}
            rowActions={(r) => <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('jobs', { id: r.id, status: r.status === 'open' ? 'closed' : 'open' }))}>{r.status === 'open' ? 'Kapat' : 'Yayınla'}</button>}
            fields={[{ name: 'title', label: 'Pozisyon', required: true }, { name: 'dept', label: 'Departman', def: 'Kreatif' }, { name: 'loc', label: 'Konum', def: 'İstanbul' }, { name: 'desc', label: 'Açıklama', type: 'textarea' }]}
            build={(v) => ({ slug: String(v.title).toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]+/g, '-').replace(/-+$/g, ''), title: String(v.title), dept: String(v.dept), location: String(v.loc), type: 'Tam zamanlı', status: 'draft' as const, headcount: 1, description: String(v.desc) })} />;
        }
        if (t === 'candidates') {
          const list = d.candidates.filter((c) => BOARD.some(([s]) => s === c.stage) && (!job || c.job_id === job));
          return (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2"><label className="label m-0" htmlFor="jf">Pozisyon</label><select id="jf" className="input w-auto" value={job} onChange={(e) => setJob(e.target.value)}><option value="">Tümü</option>{d.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></div>
              {list.length === 0 && <Empty>Bu filtrede aday yok.</Empty>}
              <Kanban<Candidate> items={list} stages={BOARD} stageOf={(c) => c.stage} readonly={!write} onMove={(c, to) => repo!.save('candidates', { id: c.id, stage: to as CandidateStage })}
                render={(c) => <><Link href={`/app/hire/${c.id}`} className="text-[13px] font-semibold hover:underline" onPointerDown={(e) => e.stopPropagation()}>{c.name}</Link><div className="mt-1 text-xs text-muted">{jobName(c.job_id)}</div><div className="mt-2 flex gap-1.5"><Chip>Puan {c.score || '—'}</Chip><Chip>{c.source}</Chip></div></>} />
            </div>
          );
        }
        if (t === 'talent') {
          const pool = d.candidates.filter((c) => c.talent_pool);
          return (
            <div className="grid gap-4">{Err}
              <Card title={`Talent pool (${pool.length})`}>{pool.length === 0 ? <Empty>Havuz boş.</Empty> : <Table heads={['Aday', 'Pozisyon', 'E-posta', 'Not', '']}>{pool.map((c) => <tr key={c.id}><td><Link className="font-semibold hover:underline" href={`/app/hire/${c.id}`}>{c.name}</Link></td><td>{jobName(c.job_id)}</td><td className="text-muted">{c.email}</td><td className="text-muted">{c.note}</td><td>{write && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('candidates', { id: c.id, talent_pool: false }))}>Havuzdan çıkar</button>}</td></tr>)}</Table>}</Card>
              <Card title="Havuza ekle"><ul className="grid gap-2">{d.candidates.filter((c) => !c.talent_pool && c.stage !== 'hired').map((c) => <li key={c.id} className="nested flex items-center justify-between text-sm"><span>{c.name} <span className="text-muted">· {CANDIDATE_STAGE_LABELS[c.stage]}</span></span>{write && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('candidates', { id: c.id, talent_pool: true }))}>Havuza ekle</button>}</li>)}</ul></Card>
            </div>
          );
        }
        const bySource = Object.entries(d.candidates.reduce<Record<string, number>>((a, c) => ({ ...a, [c.source]: (a[c.source] ?? 0) + 1 }), {}));
        return (
          <div className="grid gap-4">
            <Grid cols={2}>
              <Card title="Kaynak dağılımı"><Donut parts={bySource} label="Aday kaynağı" /></Card>
              <Card title="Pozisyon başına aday"><Table heads={['Pozisyon', 'Aday', 'Görüşme+', 'Teklif+']}>{d.jobs.map((j) => { const cs = d.candidates.filter((c) => c.job_id === j.id); return <tr key={j.id}><td>{j.title}</td><td>{cs.length}</td><td>{cs.filter((c) => c.stage !== 'applied').length}</td><td>{cs.filter((c) => ['offer', 'hired'].includes(c.stage)).length}</td></tr>; })}</Table></Card>
            </Grid>
            <div><CsvButton name="adaylar.csv" rows={[['Aday', 'Pozisyon', 'Aşama', 'Puan', 'Kaynak'], ...d.candidates.map((c) => [c.name, jobName(c.job_id), CANDIDATE_STAGE_LABELS[c.stage], c.score, c.source])]} /></div>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

export function CandidateDetail({ id }: { id: string }) {
  const { repo, mode } = useSession();
  const can = useCan();
  const q = useWorld(KINDS);
  const { act, busy, Err } = useAct();
  const today = todayFor(mode);
  const write = can.write('candidates');
  return (
    <ModulePage id="hire" title="Aday detayı" tabs={[['detail', 'Aday']]} tab="detail" actions={<Link className="btn btn-sm" href="/app/hire?tab=candidates">← Adaylar</Link>}>
      {() => <Await q={q}>{(d) => {
        const c = d.candidates.find((x) => x.id === id);
        if (!c) return <Empty>Aday bulunamadı.</Empty>;
        const ivs = d.interviews.filter((i) => i.candidate_id === id); const offer = d.offers.find((o) => o.candidate_id === id);
        return (
          <div className="grid gap-4">{Err}
            <Card title={c.name} aside={<Chip tone={c.stage === 'hired' ? 'ok' : c.stage === 'rejected' ? 'bad' : 'brand'}>{CANDIDATE_STAGE_LABELS[c.stage]}</Chip>}>
              <p className="text-sm text-muted">{d.jobs.find((j) => j.id === c.job_id)?.title} · {c.email} · <a className="underline" href={c.portfolio} target="_blank" rel="noreferrer">Portfolyo</a> · kaynak {c.source}</p>
              {c.note && <p className="mt-2 text-sm">{c.note}</p>}
              {write && c.stage !== 'hired' && <div className="mt-3 flex flex-wrap gap-2">
                {CANDIDATE_STAGES.filter((s) => !['hired'].includes(s)).map((s) => <button key={s} className="btn btn-sm" aria-pressed={c.stage === s} disabled={busy || c.stage === s} onClick={() => void act(() => repo!.save('candidates', { id: c.id, stage: s }))}>{CANDIDATE_STAGE_LABELS[s]}</button>)}
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('candidates', { id: c.id, talent_pool: !c.talent_pool }))}>{c.talent_pool ? 'Havuzdan çıkar' : 'Havuza ekle'}</button>
              </div>}
            </Card>
            <Card title="Görüşmeler">
              {ivs.length === 0 ? <Empty>Görüşme kaydı yok.</Empty> : ivs.map((i) => <div key={i.id} className="nested mb-2 text-sm"><div className="flex flex-wrap items-center gap-2"><strong>{i.kind}</strong><span className="text-muted">{fmtTime(i.at)} · {nameOf(d.team, i.interviewer)}</span>{i.recommendation && <Chip tone={i.recommendation === 'hire' ? 'ok' : i.recommendation === 'no' ? 'bad' : 'warn'}>{i.recommendation}</Chip>}</div><div className="mt-1 flex flex-wrap gap-1.5">{Object.entries(i.scores).map(([k, v]) => <Chip key={k}>{k}: {v}/5</Chip>)}</div><p className="mt-1 text-muted">{i.notes}</p></div>)}
              {write && <FormCard title="Görüşme / puan formu" busy={busy} fields={[{ name: 'at', label: 'Zaman', type: 'date', def: today }, { name: 'who', label: 'Görüşmeci', type: 'select', options: d.team.map((m) => [m.id, m.name]) }, { name: 'kind', label: 'Tür', def: 'Tanışma' }, { name: 'p', label: 'Portfolyo (1–5)', type: 'number', def: 4 }, { name: 'i', label: 'İletişim (1–5)', type: 'number', def: 4 }, { name: 'k', label: 'Kültür uyumu (1–5)', type: 'number', def: 4 }, { name: 'rec', label: 'Öneri', type: 'select', options: [['hire', 'İşe al'], ['hold', 'Beklet'], ['no', 'Hayır']] }, { name: 'notes', label: 'Not', type: 'textarea' }]}
                onSubmit={(v) => act(async () => { const scores = { Portfolyo: Number(v.p), İletişim: Number(v.i), 'Kültür uyumu': Number(v.k) }; await repo!.save('interviews', { candidate_id: c.id, at: `${String(v.at)}T10:00:00Z`, interviewer: String(v.who), kind: String(v.kind), scores, notes: String(v.notes), recommendation: String(v.rec) as 'hire' }); await repo!.save('candidates', { id: c.id, score: Math.round(((scores.Portfolyo + scores.İletişim + scores['Kültür uyumu']) / 15) * 100), stage: c.stage === 'applied' ? 'interview' : c.stage }); })} />}
            </Card>
            <Card title="Teklif">
              {offer ? <div className="nested text-sm"><strong>{offer.role_title}</strong> · {ROLE_LABELS[offer.app_role]} · başlangıç {fmtDate(offer.start_date)} <Chip tone={offer.status === 'accepted' ? 'ok' : 'warn'}>{offer.status}</Chip></div> : <Empty>Teklif yok.</Empty>}
              {write && !offer && c.stage !== 'hired' && <FormCard title="Teklif oluştur" busy={busy} fields={[{ name: 'role', label: 'Unvan', required: true, def: d.jobs.find((j) => j.id === c.job_id)?.title }, { name: 'app', label: 'Sistem rolü', type: 'select', options: ROLES.filter((r) => !['client_admin', 'client_viewer', 'owner', 'org_admin', 'payroll', 'auditor', 'integration_admin'].includes(r)).map((r) => [r, ROLE_LABELS[r]]), def: 'creative' }, { name: 'start', label: 'Başlangıç', type: 'date', def: '2026-11-16' }]}
                onSubmit={(v) => act(async () => { await repo!.save('offers', { candidate_id: c.id, role_title: String(v.role), app_role: String(v.app) as 'creative', start_date: String(v.start), status: 'sent' }); await repo!.save('candidates', { id: c.id, stage: 'offer' }); })} />}
              {write && offer && c.stage !== 'hired' && <div className="mt-3"><button className="btn btn-primary" disabled={busy} onClick={() => void act(() => repo!.hireCandidate(c.id))}>Teklif kabul edildi → People’a aktar</button><p className="mt-1 text-xs text-muted">Çalışan kartı, onboarding checklist ve ilk görev otomatik oluşur.</p></div>}
              {c.stage === 'hired' && c.employee_id && <p className="mt-3 text-sm">İşe alındı → <Link className="underline" href={`/app/people/${c.employee_id}?tab=offboarding`}>Çalışan 360 · giriş dosyası</Link></p>}
            </Card>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}
