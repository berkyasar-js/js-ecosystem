'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { HR_DOC_TYPES, LEAVE_DECIDERS, LEAVE_TYPES, type Checklist, type HrDoc, type HrProfile, type Records } from '@jscore/contracts';
import { Empty, fmtDate, fmtTime, todayFor, useData } from '../ui';
import { useSession } from '../session';
import { Await, Bar, Card, Chip, Crud, Gate, Grid, Metric, ModulePage, Table, nameOf, toneOf, useAct, useCan, useWorld } from '../mod';
import { BarChart, Donut } from '../charts';
import { downloadCsv } from '@/lib/domain';
import { CsvButton } from '../mod';

const TABS: Array<[string, string]> = [['overview', 'Genel bakış'], ['employees', 'Çalışanlar'], ['archive', 'Personel Arşivi'], ['leave', 'İzin / Mesai / Vardiya'], ['expenses', 'Masraf / Avans / Zimmet / Eğitim'], ['reports', 'HR Reports'], ['import', 'Kolay İK Aktarım']];
const ALL = ['hr_profiles', 'hr_docs', 'hr_assets', 'trainings', 'perf_reviews', 'shifts', 'advances', 'checklists', 'payroll_runs', 'import_batches', 'leaves', 'time_entries', 'skills'] as const;
const DOC_TONE = { ok: 'ok', missing: 'bad', expired: 'warn' } as const;

export function StepUp({ what }: { what: string }) {
  return (
    <div className="card max-w-xl" role="note">
      <Chip tone="warn">Step-up gerekli</Chip>
      <p className="mt-3 text-sm"><strong>{what}</strong> yalnızca Bordro (payroll) yetkisi ve MFA doğrulaması ile açılır.</p>
      <p className="mt-1 text-xs text-muted">Owner ve Org Admin dahil diğer roller bu alanı varsayılan olarak göremez; tutarlar hiçbir ekranda düz metin olarak gösterilmez ve ilk erişim denetim kaydına yazılır.</p>
      <button className="btn btn-sm mt-3" disabled>MFA ile doğrula</button>
    </div>
  );
}

function progress(list: Checklist[]) { return list.length ? Math.round((list.filter((c) => c.done).length / list.length) * 100) : 0; }

export function PeopleView({ tab }: { tab?: string }) {
  const { mode, repo, me } = useSession();
  const can = useCan();
  const q = useWorld(ALL);
  const audit = useData(async (r) => (await r.listAudit().catch(() => [])).filter((e) => e.action.startsWith('hr') || e.resource.startsWith('hr')));
  const { act, busy, Err } = useAct();
  const today = todayFor(mode);
  const logged = useRef(false);
  useEffect(() => { if (tab === 'archive' && repo && can.read('hr_docs') && !logged.current) { logged.current = true; void repo.audit('hr_archive.read', 'hr_docs', { tab: 'archive' }); } }, [tab, repo]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = can.write('hr_profiles');
  return (
    <ModulePage id="people" title="JS People" sub="HRIS: çalışanlar, özlük arşivi, izin, zimmet ve aktarım" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const staff = d.team.filter((m) => d.hr_profiles.some((p) => p.employee_id === m.id) || m.status === 'active');
        const prof = (id: string): HrProfile | undefined => d.hr_profiles.find((p) => p.employee_id === id);
        const docs = d.hr_docs;
        if (t === 'overview') {
          const off = d.hr_profiles.filter((p) => p.status === 'offboarding');
          const pend = d.leaves.filter((l) => l.status === 'pending');
          return (
            <div className="grid gap-4">
              <Grid cols={4}>
                <Metric label="Aktif çalışan" value={d.hr_profiles.filter((p) => p.status !== 'left').length} def="Ayrılmamış (aktif + çıkış sürecindeki) çalışan sayısı." />
                <Metric label="Çıkış sürecinde" value={off.length} tone={off.length ? 'warn' : 'ok'} def="Offboarding checklist'i açık olan çalışanlar." />
                <Metric label="Bekleyen izin" value={pend.length} def="Onay bekleyen izin talepleri." />
                <Metric label="Eksik / süresi dolan belge" value={can.read('hr_docs') ? docs.filter((x) => x.status !== 'ok').length : '—'} tone={docs.some((x) => x.status !== 'ok') ? 'bad' : 'ok'} def="Özlük arşivinde missing veya expired durumundaki belgeler (yalnızca İK görür)." />
              </Grid>
              <Card title="Çıkış süreçleri (offboarding)">
                {off.length === 0 ? <Empty>Açık çıkış süreci yok.</Empty> : <div className="grid gap-3 sm:grid-cols-2">{off.map((p) => { const list = d.checklists.filter((c) => c.employee_id === p.employee_id && c.flow === 'offboarding'); const pct = progress(list); return (
                  <div key={p.id} className="nested"><div className="flex items-center justify-between"><strong>{nameOf(d.team, p.employee_id)}</strong><Chip tone="warn">Son gün {fmtDate(p.end_date ?? '')}</Chip></div><div className="my-2"><Bar pct={pct} tone={toneOf(pct)} /></div><div className="flex items-center justify-between text-xs text-muted">{list.filter((c) => c.done).length}/{list.length} adım<Link className="underline" href={`/app/people/${p.employee_id}?tab=offboarding`}>Dosyayı aç</Link></div></div>); })}</div>}
              </Card>
            </div>
          );
        }
        if (t === 'employees') {
          return <Card title={`Çalışanlar (${staff.length})`}><Table heads={['Ad', 'Unvan', 'Departman', 'Yönetici', 'Durum', '']}>{staff.map((m) => { const p = prof(m.id); return (
            <tr key={m.id}><td><Link className="font-semibold hover:underline" href={`/app/people/${m.id}`}>{m.name}</Link></td><td className="text-muted">{m.role_title}</td><td>{p?.dept ?? '—'}</td><td>{p?.manager ? nameOf(d.team, p.manager).split(' ')[0] : '—'}</td>
              <td><Chip tone={p?.status === 'offboarding' ? 'warn' : 'ok'}>{p?.status === 'offboarding' ? `Çıkış ${fmtDate(p.end_date ?? '')}` : 'Aktif'}</Chip></td><td><Link className="btn btn-sm" href={`/app/people/${m.id}`}>360</Link></td></tr>); })}</Table></Card>;
        }
        if (t === 'archive') {
          if (!can.read('hr_docs')) return <StepUp what="Personel Arşivi (özlük belgeleri)" />;
          const bad = docs.filter((x) => x.status !== 'ok'); const purge = docs.filter((x) => x.retention_until && x.retention_until < today);
          const matrix = HR_DOC_TYPES.slice(0, 5);
          const importCsv = async (text: string) => {
            const lines = text.trim().split(/\r?\n/).slice(1).filter(Boolean);
            for (const ln of lines) { const [emp, type, status] = ln.split(',').map((x) => x.trim()); if (emp && type) await repo!.save('hr_docs', { employee_id: emp, doc_type: type, status: (status as HrDoc['status']) || 'ok', expires_at: null, retention_until: '2036-12-31' }); }
          };
          return (
            <div className="grid gap-4">{Err}
              <Grid cols={3}>
                <Metric label="Aktif dosya" value={d.hr_profiles.filter((p) => p.status !== 'left').length} def="Aktif ve çıkış sürecindeki personel dosyaları." />
                <Metric label="Eski personel" value={d.hr_profiles.filter((p) => p.status === 'left').length} def="Ayrılmış personel dosyaları (saklama süresi boyunca tutulur)." />
                <Metric label="Eksik / süresi dolan" value={bad.length} tone={bad.length ? 'bad' : 'ok'} def="missing veya expired belge sayısı." />
              </Grid>
              <Card title="Belge türleri × çalışan" aside={<span className="flex gap-2"><CsvButton name="ozluk-arsivi.csv" rows={[['Çalışan', 'Belge', 'Durum', 'Bitiş', 'Saklama'], ...docs.map((x) => [x.employee_id, x.doc_type, x.status, x.expires_at, x.retention_until])]} /></span>}>
                <div className="overflow-x-auto"><table className="table"><thead><tr><th>Çalışan</th>{matrix.map((m) => <th key={m}>{m}</th>)}</tr></thead><tbody>{staff.map((m) => (
                  <tr key={m.id}><td className="font-semibold">{m.name.split(' ')[0]}</td>{matrix.map((dt) => { const x = docs.find((y) => y.employee_id === m.id && y.doc_type === dt); return <td key={dt}>{x ? <Chip tone={DOC_TONE[x.status]}>{x.status === 'ok' ? '✓' : x.status === 'missing' ? 'eksik' : 'süresi doldu'}</Chip> : <span className="text-muted">—</span>}</td>; })}</tr>))}</tbody></table></div>
              </Card>
              <Card title="Eksik / süresi dolan belgeler">{bad.length === 0 ? <Empty>Tüm belgeler tamam.</Empty> : <Table heads={['Çalışan', 'Belge', 'Durum', '']}>{bad.map((x) => <tr key={x.id}><td>{nameOf(d.team, x.employee_id)}</td><td>{x.doc_type}</td><td><Chip tone={DOC_TONE[x.status]}>{x.status}</Chip></td><td>{write && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('hr_docs', { id: x.id, status: 'ok', expires_at: null }))}>Tamamlandı</button>}</td></tr>)}</Table>}</Card>
              <Card title="Saklama / imha">
                <p className="mb-2 text-xs text-muted">Her belgenin saklama bitişi vardır; süresi dolanlar imha adayıdır. İmha işlemi geri alınamaz ve denetim kaydına yazılır.</p>
                {purge.length === 0 ? <Empty>İmha edilecek belge yok (en erken saklama bitişi: {fmtDate(docs.map((x) => x.retention_until ?? '9999').sort()[0] ?? '')}).</Empty> : <Table heads={['Çalışan', 'Belge', 'Saklama bitişi', '']}>{purge.map((x) => <tr key={x.id}><td>{nameOf(d.team, x.employee_id)}</td><td>{x.doc_type}</td><td>{fmtDate(x.retention_until ?? '')}</td><td><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.remove('hr_docs', x.id))}>İmha et</button></td></tr>)}</Table>}
              </Card>
              <Card title="İçe aktar">
                <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void act(() => importCsv(String(f.get('csv')))); }}>
                  <label className="label" htmlFor="csv">CSV (başlık: calisan,belge,durum)</label><textarea id="csv" name="csv" className="input min-h-20 font-mono text-xs" defaultValue={'calisan,belge,durum\nFA,Gizlilik taahhüdü,ok'} /><div><button className="btn btn-sm" disabled={busy}>İçe aktar</button></div>
                </form>
              </Card>
              <Card title="Erişim kayıtları (özlük arşivi)">
                {audit.data && audit.data.length ? <Table heads={['Zaman', 'Kim', 'İşlem', 'Kaynak']}>{audit.data.slice(0, 15).map((e) => <tr key={e.id}><td>{fmtTime(e.occurred_at)}</td><td>{e.actor_name}</td><td>{e.action}</td><td className="text-muted">{e.resource}</td></tr>)}</Table> : <Empty>Henüz erişim kaydı yok.</Empty>}
              </Card>
            </div>
          );
        }
        if (t === 'leave') {
          const decide = LEAVE_DECIDERS.includes(me?.role ?? 'client_viewer');
          return (
            <div className="grid gap-4">{Err}
              <Card title="İzin talepleri (onay → Resource Planner kapasitesi düşer)">
                {d.leaves.length === 0 ? <Empty>İzin yok.</Empty> : <Table heads={['Kişi', 'Tür', 'Tarih', 'Gün', 'Durum', '']}>{d.leaves.map((l) => <tr key={l.id}><td>{nameOf(d.team, l.employee_id)}</td><td>{LEAVE_TYPES[l.type]}</td><td>{fmtDate(l.start)}–{fmtDate(l.end)}</td><td>{l.days}</td><td><Chip tone={l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'bad' : 'warn'}>{l.status}</Chip></td><td>{decide && l.status === 'pending' && <><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideLeave(l.id, 'approved'))}>Onayla</button> <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideLeave(l.id, 'rejected'))}>Reddet</button></>}</td></tr>)}</Table>}
              </Card>
              <Crud kind="shifts" title="Mesai / vardiya" rows={d.shifts} canEdit={can.write('shifts')} empty="Kayıt yok." heads={['Kişi', 'Tarih', 'Saat', 'Tür', 'Fazla mesai']}
                cells={(r) => [nameOf(d.team, r.employee_id), fmtDate(r.date), `${r.start}–${r.end}`, r.kind, r.hours ? `${r.hours} sa` : '—']}
                fields={[{ name: 'emp', label: 'Kişi', type: 'select', options: d.team.map((m) => [m.id, m.name]) }, { name: 'date', label: 'Tarih', type: 'date', def: today }, { name: 'start', label: 'Başlangıç', def: '09:00' }, { name: 'end', label: 'Bitiş', def: '18:00' }, { name: 'kind', label: 'Tür', type: 'select', options: [['vardiya', 'Vardiya'], ['mesai', 'Fazla mesai']] }, { name: 'hours', label: 'Fazla mesai (sa)', type: 'number', def: 0 }]}
                build={(v) => ({ employee_id: String(v.emp), date: String(v.date), start: String(v.start), end: String(v.end), kind: String(v.kind) as 'mesai', hours: Number(v.hours) })} />
            </div>
          );
        }
        if (t === 'expenses') {
          return (
            <div className="grid gap-6">
              <Gate ok={can.read('advances')} why="Masraf/avans kayıtlarını görme yetkin yok."><Crud kind="advances" title="Masraf / Avans" rows={d.advances} canEdit={can.write('advances')} empty="Kayıt yok." heads={['Kişi', 'Tür', 'Tutar', 'Durum', 'Not']}
                cells={(r) => [nameOf(d.team, r.employee_id), r.kind, `${new Intl.NumberFormat('tr-TR').format(r.amount_minor / 100)} ₺`, <Chip key="s" tone={r.status === 'pending' ? 'warn' : 'ok'}>{r.status}</Chip>, r.note]}
                rowActions={(r) => r.status === 'pending' ? <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('advances', { id: r.id, status: 'approved' }))}>Onayla</button> : null}
                fields={[{ name: 'emp', label: 'Kişi', type: 'select', options: d.team.map((m) => [m.id, m.name]) }, { name: 'kind', label: 'Tür', type: 'select', options: [['masraf', 'Masraf'], ['avans', 'Avans']] }, { name: 'amount', label: 'Tutar (₺)', type: 'number', def: 500 }, { name: 'note', label: 'Not' }]}
                build={(v) => ({ employee_id: String(v.emp), kind: String(v.kind) as 'masraf', amount_minor: Math.round(Number(v.amount) * 100), status: 'pending' as const, note: String(v.note) })} /></Gate>
              <Gate ok={can.read('hr_assets')} why=""><Crud kind="hr_assets" title="Zimmet" rows={d.hr_assets} canEdit={can.write('hr_assets')} empty="Zimmet yok." heads={['Kişi', 'Eşya', 'Seri', 'Veriliş', 'İade']}
                cells={(r) => [nameOf(d.team, r.employee_id), r.item, r.serial, fmtDate(r.assigned_at), r.returned_at ? fmtDate(r.returned_at) : <Chip key="o" tone="warn">üzerinde</Chip>]}
                rowActions={(r) => !r.returned_at ? <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('hr_assets', { id: r.id, returned_at: today }))}>İade alındı</button> : null}
                fields={[{ name: 'emp', label: 'Kişi', type: 'select', options: d.team.map((m) => [m.id, m.name]) }, { name: 'item', label: 'Eşya', required: true }, { name: 'serial', label: 'Seri no' }]}
                build={(v) => ({ employee_id: String(v.emp), item: String(v.item), serial: String(v.serial), assigned_at: today, returned_at: null })} /></Gate>
              <Gate ok={can.read('trainings')} why=""><Crud kind="trainings" title="Eğitim" rows={d.trainings} canEdit={can.write('trainings')} empty="Eğitim yok." heads={['Kişi', 'Eğitim', 'Tarih', 'Süre', 'Durum']}
                cells={(r) => [nameOf(d.team, r.employee_id), r.title, fmtDate(r.date), `${r.hours} sa`, <Chip key="s" tone={r.status === 'done' ? 'ok' : 'warn'}>{r.status === 'done' ? 'Tamam' : 'Planlı'}</Chip>]}
                fields={[{ name: 'emp', label: 'Kişi', type: 'select', options: d.team.map((m) => [m.id, m.name]) }, { name: 'title', label: 'Eğitim', required: true }, { name: 'date', label: 'Tarih', type: 'date', def: today }, { name: 'hours', label: 'Süre (sa)', type: 'number', def: 4 }]}
                build={(v) => ({ employee_id: String(v.emp), title: String(v.title), status: 'planned' as const, date: String(v.date), hours: Number(v.hours) })} /></Gate>
            </div>
          );
        }
        if (t === 'reports') {
          const byDept = Object.entries(d.hr_profiles.filter((p) => p.status !== 'left').reduce<Record<string, number>>((a, p) => ({ ...a, [p.dept]: (a[p.dept] ?? 0) + 1 }), {}));
          const leaveBy = staff.map((m) => [m.name.split(' ')[0], d.leaves.filter((l) => l.employee_id === m.id && l.status === 'approved').reduce((s, l) => s + l.days, 0)] as [string, number]).filter(([, n]) => n > 0);
          const okDocs = docs.length ? Math.round((docs.filter((x) => x.status === 'ok').length / docs.length) * 100) : 0;
          return (
            <div className="grid gap-4">
              <Grid cols={3}>
                <Metric label="Belge tamamlama" value={can.read('hr_docs') ? `%${okDocs}` : '—'} def="Durumu ok olan belge / toplam belge." />
                <Metric label="Eğitim saati" value={d.trainings.filter((x) => x.status === 'done').reduce((s, x) => s + x.hours, 0)} def="Tamamlanan eğitimlerin toplam süresi." />
                <Metric label="Çıkış oranı (planlı)" value={`%${Math.round((d.hr_profiles.filter((p) => p.status === 'offboarding').length / Math.max(1, d.hr_profiles.length)) * 100)}`} def="Çıkış sürecindeki çalışan / toplam çalışan." />
              </Grid>
              <Grid cols={2}>
                <Card title="Departman dağılımı"><Donut parts={byDept} label="Departman dağılımı" /></Card>
                <Card title="Onaylı izin günü (kişi)">{leaveBy.length ? <BarChart data={leaveBy} label="İzin günü" /> : <Empty>Veri yok.</Empty>}</Card>
              </Grid>
              <div><button className="btn btn-sm" onClick={() => downloadCsv('hr-rapor.csv', [['Çalışan', 'Departman', 'Durum', 'Onaylı izin günü'], ...staff.map((m) => [m.name, prof(m.id)?.dept ?? '', prof(m.id)?.status ?? '', d.leaves.filter((l) => l.employee_id === m.id && l.status === 'approved').reduce((s, l) => s + l.days, 0)])])}>HR raporunu CSV indir</button></div>
            </div>
          );
        }
        const phases: Record<string, string> = { A: 'Çalışan kartlarını Kolay İK’tan dışa aktar (xlsx → csv) ve içe al.', B: 'Özlük belgelerini klasör yapısıyla aktar; eksikleri arşiv ekranından tamamla.', C: 'İzin bakiyelerini ve geçmişi doğrula.', D: 'Zimmet ve eğitim kayıtlarını aktar.' };
        return (
          <div className="grid gap-4">{Err}
            <Card title="Kolay İK aktarım kontrol listesi">
              <ol className="grid gap-3">{(['A', 'B', 'C', 'D'] as const).map((ph) => { const b = d.import_batches.find((x) => x.phase === ph); return (
                <li key={ph} className="nested flex flex-wrap items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-bold text-white">{ph}</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{b?.title}</div><div className="text-xs text-muted">{phases[ph]}</div></div>
                  <Chip tone={b?.status === 'done' ? 'ok' : 'warn'}>{b?.status === 'done' ? 'Tamam' : 'Bekliyor'}</Chip>
                  {write && b && b.status !== 'done' && <button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.save('import_batches', { id: b.id, status: 'done', ok: b.rows, failed: 0 }))}>Partiyi çalıştır</button>}</li>); })}</ol>
            </Card>
            <Card title="Batch tablosu"><Table heads={['Faz', 'Başlık', 'Satır', 'Başarılı', 'Hatalı', 'Durum']}>{d.import_batches.map((b) => <tr key={b.id}><td>{b.phase}</td><td>{b.title}</td><td>{b.rows}</td><td>{b.ok}</td><td className={b.failed ? 'text-magenta' : ''}>{b.failed}</td><td><Chip tone={b.status === 'done' ? 'ok' : undefined}>{b.status}</Chip></td></tr>)}</Table></Card>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}

const T360: Array<[string, string]> = [['profile', 'Profil'], ['docs', 'Özlük belgeleri'], ['contracts', 'Sözleşmeler'], ['leave', 'İzin geçmişi'], ['time', 'Mesai / puantaj'], ['payroll', 'Bordro'], ['pay', 'Ücret'], ['assets', 'Zimmet'], ['training', 'Eğitim'], ['perf', 'Performans'], ['offboarding', 'Giriş / ayrılış dosyası']];

export function Employee360({ id, tab }: { id: string; tab?: string }) {
  const { repo, me } = useSession();
  const can = useCan();
  const q = useWorld(ALL);
  const { act, busy, Err } = useAct();
  const isPayroll = me?.role === 'payroll';
  return (
    <ModulePage id="people" title="Çalışan 360" tabs={T360.map(([k, l]) => [k, l])} tab={tab} actions={<Link className="btn btn-sm" href="/app/people?tab=employees">← Çalışanlar</Link>}>
      {(t) => <Await q={q}>{(d) => {
        const m = d.team.find((x) => x.id === id); const p = d.hr_profiles.find((x) => x.employee_id === id);
        if (!m) return <Empty>Çalışan bulunamadı.</Empty>;
        const mine = <K extends 'hr_docs' | 'hr_assets' | 'trainings' | 'perf_reviews' | 'leaves' | 'shifts' | 'checklists' | 'skills'>(k: K) => (d[k] as Records[K][]).filter((r) => (r as { employee_id?: string }).employee_id === id);
        const head = <div className="mb-4 card flex flex-wrap items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-brand font-bold text-white">{m.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</div><div><div className="text-lg font-bold">{m.name}</div><div className="text-sm text-muted">{m.role_title} · {p?.dept ?? ''}</div></div><Chip tone={p?.status === 'offboarding' ? 'warn' : 'ok'}>{p?.status === 'offboarding' ? `Çıkış ${fmtDate(p.end_date ?? '')}` : 'Aktif'}</Chip></div>;
        let body: React.ReactNode;
        if (t === 'profile') body = <Card title="Profil"><dl className="grid gap-2 text-sm sm:grid-cols-2">{[['Unvan', m.role_title], ['Departman', p?.dept], ['Yönetici', p?.manager ? nameOf(d.team, p.manager) : '—'], ['Başlangıç', p ? fmtDate(p.start_date) : '—'], ['E-posta', p?.email], ['Telefon', p?.phone], ['İstihdam', p?.employment], ['Haftalık saat', m.weekly_hours]].map(([k, v]) => <div key={String(k)} className="flex justify-between gap-3 border-b border-line py-1"><dt className="text-muted">{k}</dt><dd>{String(v ?? '—')}</dd></div>)}</dl><div className="mt-3 flex flex-wrap gap-1.5">{mine('skills').map((s) => <Chip key={s.id}>{s.skill} {'★'.repeat(s.level)}</Chip>)}</div></Card>;
        else if (t === 'docs') body = !can.read('hr_docs') ? <StepUp what="Özlük belgeleri" /> : <Card title="Özlük belgeleri"><Table heads={['Belge', 'Durum', 'Bitiş', 'Saklama']}>{mine('hr_docs').map((x) => <tr key={x.id}><td>{x.doc_type}</td><td><Chip tone={DOC_TONE[x.status]}>{x.status}</Chip></td><td>{x.expires_at ? fmtDate(x.expires_at) : '—'}</td><td className="text-muted">{x.retention_until ? fmtDate(x.retention_until) : '—'}</td></tr>)}</Table></Card>;
        else if (t === 'contracts') body = <Card title="Sözleşmeler">{(() => { const c = mine('hr_docs').filter((x) => x.doc_type === 'İş sözleşmesi'); return can.read('hr_docs') ? (c.length ? c.map((x) => <p key={x.id} className="text-sm">İş sözleşmesi · <Chip tone={DOC_TONE[x.status]}>{x.status}</Chip> · {p?.employment === 'intern' ? 'Staj sözleşmesi' : 'Belirsiz süreli'}</p>) : <Empty>Sözleşme kaydı yok.</Empty>) : <p className="text-sm text-muted">Sözleşme belgeleri özlük arşivi yetkisi ister; istihdam türü: {p?.employment}.</p>; })()}</Card>;
        else if (t === 'leave') { const used = mine('leaves').filter((l) => l.status === 'approved' && l.type === 'yillik').reduce((s, l) => s + l.days, 0); body = <Card title={`İzin geçmişi · kalan yıllık izin ${(p?.leave_total ?? 14) - used} / ${p?.leave_total ?? 14} gün`}>{mine('leaves').length === 0 ? <Empty>İzin kaydı yok.</Empty> : <Table heads={['Tür', 'Tarih', 'Gün', 'Durum']}>{mine('leaves').map((l) => <tr key={l.id}><td>{LEAVE_TYPES[l.type]}</td><td>{fmtDate(l.start)}–{fmtDate(l.end)}</td><td>{l.days}</td><td><Chip tone={l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'bad' : 'warn'}>{l.status}</Chip></td></tr>)}</Table>}</Card>; }
        else if (t === 'time') { const ent = d.time_entries.filter((e) => e.employee_id === id); body = <Card title="Mesai / puantaj"><p className="mb-2 text-sm">Kayıtlı toplam: <strong>{Math.round(ent.reduce((s, e) => s + e.minutes, 0) / 6) / 10} saat</strong> · Fazla mesai: <strong>{mine('shifts').reduce((s, x) => s + x.hours, 0)} saat</strong></p>{mine('shifts').length === 0 ? <Empty>Vardiya/mesai kaydı yok.</Empty> : <Table heads={['Tarih', 'Saat', 'Tür']}>{mine('shifts').map((x) => <tr key={x.id}><td>{fmtDate(x.date)}</td><td>{x.start}–{x.end}</td><td>{x.kind}</td></tr>)}</Table>}</Card>; }
        else if (t === 'payroll') body = !isPayroll ? <StepUp what="Bordro" /> : <Card title="Bordro dönemleri"><Table heads={['Dönem', 'Durum', 'Not']}>{d.payroll_runs.map((x) => <tr key={x.id}><td>{x.period}</td><td><Chip tone={x.status === 'paid' ? 'ok' : 'warn'}>{x.status}</Chip></td><td className="text-muted">{x.note}</td></tr>)}</Table><p className="mt-3 text-xs text-muted">Tutarlar bu ekranda gösterilmez; Payroll Vault’tan imzalı dışa aktarım yapılır.</p></Card>;
        else if (t === 'pay') body = !isPayroll ? <StepUp what="Ücret bilgisi" /> : <Card title="Ücret"><p className="text-2xl font-bold tracking-widest" aria-label="Maskeli">••••••</p><p className="mt-2 text-xs text-muted">Ücret tutarı ve geçmişi düz metin gösterilmez (yalnızca Payroll Vault, MFA step-up sonrası). Bu ekranda erişim denetim kaydına yazılır.</p><button className="btn btn-sm mt-3" onClick={() => void repo!.audit('payroll.reveal_requested', `employees/${id}`)}>Vault erişimi iste (loglanır)</button></Card>;
        else if (t === 'assets') body = <Card title="Zimmet">{!can.read('hr_assets') ? <p className="text-sm text-muted">Zimmet kayıtlarını görme yetkin yok.</p> : mine('hr_assets').length === 0 ? <Empty>Zimmet yok.</Empty> : <Table heads={['Eşya', 'Seri', 'Veriliş', 'İade']}>{mine('hr_assets').map((x) => <tr key={x.id}><td>{x.item}</td><td>{x.serial}</td><td>{fmtDate(x.assigned_at)}</td><td>{x.returned_at ? fmtDate(x.returned_at) : <Chip tone="warn">üzerinde</Chip>}</td></tr>)}</Table>}</Card>;
        else if (t === 'training') body = <Card title="Eğitim">{mine('trainings').length === 0 ? <Empty>Eğitim kaydı yok.</Empty> : <Table heads={['Eğitim', 'Tarih', 'Süre', 'Durum']}>{mine('trainings').map((x) => <tr key={x.id}><td>{x.title}</td><td>{fmtDate(x.date)}</td><td>{x.hours} sa</td><td><Chip tone={x.status === 'done' ? 'ok' : 'warn'}>{x.status}</Chip></td></tr>)}</Table>}</Card>;
        else if (t === 'perf') body = !can.read('perf_reviews') ? <StepUp what="Performans değerlendirmeleri (İK / Bordro)" /> : <Card title="Performans">{mine('perf_reviews').length === 0 ? <Empty>Değerlendirme yok.</Empty> : mine('perf_reviews').map((x) => <p key={x.id} className="text-sm"><strong>{x.period}</strong> · {x.score}/5 <span className="text-muted">— {x.note}</span></p>)}</Card>;
        else body = (['onboarding', 'offboarding'] as const).map((flow) => { const list = mine('checklists').filter((c) => c.flow === flow); if (!list.length && flow === 'onboarding') return null; return (
          <Card key={flow} title={flow === 'offboarding' ? 'Ayrılış (offboarding) dosyası' : 'Giriş (onboarding) dosyası'} aside={<span className="w-32"><Bar pct={progress(list)} tone={toneOf(progress(list))} /></span>} className="mb-4">
            {list.length === 0 ? <Empty>Açık adım yok.</Empty> : <ul className="grid gap-2">{list.map((c) => <li key={c.id} className="nested flex items-center gap-3"><input type="checkbox" checked={c.done} disabled={busy || !can.write('checklists')} aria-label={c.title} onChange={() => void act(() => repo!.save('checklists', { id: c.id, done: !c.done }))} /><span className={`flex-1 text-sm ${c.done ? 'text-muted line-through' : ''}`}>{c.title}</span><Chip tone={!c.done && c.due < '2026-10-30' ? 'warn' : undefined}>{fmtDate(c.due)}</Chip><span className="text-xs text-muted">{nameOf(d.team, c.owner).split(' ')[0]}</span></li>)}</ul>}
          </Card>); });
        return <>{Err}{head}{body}</>;
      }}</Await>}
    </ModulePage>
  );
}
