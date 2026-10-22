'use client';
import { useState } from 'react';
import { LEAVE_DECIDERS, LEAVE_TYPES } from '@jscore/contracts';
import { Empty, fmtDate, todayFor } from '../ui';
import { useSession } from '../session';
import { Await, Card, Chip, Crud, FormCard, Gate, Metric, ModulePage, Table, nameOf, useAct, useCan, useWorld } from '../mod';
import { addDays, mondayOf, weekdaysOverlap, weeklyCapacity, weeksFrom } from '@jscore/core/domain';

const TABS: Array<[string, string]> = [['planner', 'Resource Planner'], ['capacity', 'Kapasite düzenleme'], ['leave', 'İzin takvimi'], ['skills', 'Yetkinlik havuzu'], ['equipment', 'Ekipman'], ['rates', 'Freelancer rate card']];
const heat = (pct: number) => (pct > 110 ? 'rgba(255,51,102,.55)' : pct > 100 ? 'rgba(255,51,102,.35)' : pct >= 85 ? 'rgba(255,176,32,.35)' : pct > 0 ? 'rgba(61,220,151,.25)' : 'transparent');

export function ResourcesView({ tab }: { tab?: string }) {
  const { mode, repo, me } = useSession();
  const can = useCan();
  const q = useWorld(['allocations', 'leaves', 'skills', 'equipment', 'equipment_bookings', 'rate_cards']);
  const { act, busy, Err } = useAct();
  const today = todayFor(mode);
  const weeks = weeksFrom(today, 6);
  const [conflict, setConflict] = useState<string | null>(null);
  return (
    <ModulePage id="resources" title="JS Resources" sub="Kapasite, izin, yetkinlik, ekipman ve freelancer" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const team = d.team.filter((m) => m.status === 'active');
        const write = can.write('allocations');
        if (t === 'planner') {
          const over = team.flatMap((m) => weeks.filter((w) => weeklyCapacity(m, w, d.allocations, d.leaves).over40).map(() => m.id));
          return (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric label="Aşırı yük (hücre)" value={over.length} tone={over.length ? 'bad' : 'ok'} def="Haftalık tahsisi 40 saati aşan kişi×hafta sayısı." />
                <Metric label="Bu hafta ort. doluluk" value={`%${Math.round(team.reduce((s, m) => s + weeklyCapacity(m, weeks[0], d.allocations, d.leaves).load_pct, 0) / Math.max(1, team.length))}`} def="Tahsis edilen saat / (haftalık saat − onaylı izin saati)." />
                <Metric label="Onaylı izin (6 hf)" value={d.leaves.filter((l) => l.status === 'approved').length} def="Onaylanan izinler kapasiteyi gün başına haftalık saat/5 kadar düşürür." />
              </div>
              <Card title="Kişi × 6 hafta ısı haritası" aside={<span className="flex gap-1 text-[11px]"><Chip tone="ok">&lt;85</Chip><Chip tone="warn">85–100</Chip><Chip tone="bad">&gt;100</Chip></span>}>
                <div className="overflow-x-auto"><table className="table" aria-label="Kapasite ısı haritası"><thead><tr><th>Kişi</th>{weeks.map((w) => <th key={w}>{fmtDate(w)}</th>)}</tr></thead><tbody>
                  {team.map((m) => (
                    <tr key={m.id}><td className="whitespace-nowrap font-semibold">{m.name.split(' ')[0]} <span className="text-xs text-muted">{m.weekly_hours}s</span></td>
                      {weeks.map((w) => { const c = weeklyCapacity(m, w, d.allocations, d.leaves); return (
                        <td key={w} style={{ background: heat(c.load_pct) }} title={`${c.allocated}s / ${c.capacity}s kapasite${c.leave_days ? ` · ${c.leave_days} gün izin` : ''}`} className="text-center text-xs">
                          <strong>%{c.load_pct > 900 ? '∞' : c.load_pct}</strong><div className="text-muted">{c.allocated}/{c.capacity}</div>{c.over40 && <span className="text-[10px] font-bold text-magenta">&gt;40s</span>}</td>); })}
                    </tr>
                  ))}
                </tbody></table></div>
              </Card>
            </div>
          );
        }
        if (t === 'capacity') {
          const setHours = (empId: string, week: string, value: number) => act(async () => {
            const rows = d.allocations.filter((a) => a.employee_id === empId && a.week === week);
            const total = rows.reduce((s, a) => s + a.hours, 0);
            if (rows[0]) await repo!.save('allocations', { id: rows[0].id, hours: Math.max(0, value - (total - rows[0].hours)) });
            else await repo!.save('allocations', { employee_id: empId, week, hours: Math.max(0, value), project_id: null });
          });
          return (
            <Gate ok={write} why="Kapasite düzenleme yetkin yok (yalnızca operasyon ve yöneticiler)."><div className="grid gap-3">{Err}
              <Card title="Haftalık tahsis (saat)">
                <div className="overflow-x-auto"><table className="table"><thead><tr><th>Kişi</th>{weeks.map((w) => <th key={w}>{fmtDate(w)}</th>)}</tr></thead><tbody>
                  {team.map((m) => (
                    <tr key={m.id}><td className="whitespace-nowrap font-semibold">{m.name.split(' ')[0]}</td>
                      {weeks.map((w) => { const c = weeklyCapacity(m, w, d.allocations, d.leaves); return (
                        <td key={w}><input type="number" min={0} max={80} defaultValue={c.allocated} key={`${m.id}${w}${c.allocated}`} disabled={busy} aria-label={`${m.name} ${fmtDate(w)} saat`} className={`input w-20 ${c.over40 ? 'border-magenta' : ''}`}
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== c.allocated) void setHours(m.id, w, v); }} />
                          {c.over40 ? <div className="mt-1 text-[11px] font-semibold text-magenta" role="alert">40 saati aşıyor</div> : c.allocated > c.capacity ? <div className="mt-1 text-[11px] text-[#ffb020]">kapasite {c.capacity}s</div> : null}</td>); })}
                    </tr>
                  ))}
                </tbody></table></div>
                <p className="mt-3 text-xs text-muted">Değeri değiştirip alandan çık; kayıt audit loguna yazılır. 40 saat üzeri tahsis uyarı verir ama engellenmez.</p>
              </Card>
            </div></Gate>
          );
        }
        if (t === 'leave') {
          const decide = LEAVE_DECIDERS.includes(me?.role ?? 'client_viewer');
          const sorted = [...d.leaves].sort((a, b) => a.start.localeCompare(b.start));
          return (
            <div className="grid gap-4">{Err}
              <Card title="İzin takvimi (onaylı = dolu, bekleyen = çizgili)">
                <div className="overflow-x-auto"><table className="table"><thead><tr><th>Kişi</th>{weeks.map((w) => <th key={w}>{fmtDate(w)}</th>)}</tr></thead><tbody>
                  {team.map((m) => <tr key={m.id}><td className="font-semibold">{m.name.split(' ')[0]}</td>{weeks.map((w) => {
                    const ap = d.leaves.filter((l) => l.employee_id === m.id && l.status === 'approved').reduce((s, l) => s + weekdaysOverlap(l.start, l.end, w), 0);
                    const pe = d.leaves.filter((l) => l.employee_id === m.id && l.status === 'pending').reduce((s, l) => s + weekdaysOverlap(l.start, l.end, w), 0);
                    return <td key={w} className="text-center text-xs">{ap > 0 && <Chip tone="ok">{ap}g</Chip>}{pe > 0 && <Chip tone="warn">{pe}g?</Chip>}</td>;
                  })}</tr>)}
                </tbody></table></div>
              </Card>
              <Card title="İzin talepleri">
                {sorted.length === 0 ? <Empty>İzin kaydı yok.</Empty> : (
                  <Table heads={['Kişi', 'Tür', 'Tarih', 'Gün', 'Kapasite etkisi', 'Durum', '']}>
                    {sorted.map((l) => { const m = team.find((x) => x.id === l.employee_id); const lost = m ? Math.round(l.days * (m.weekly_hours / 5) * 10) / 10 : 0; return (
                      <tr key={l.id}><td>{nameOf(d.team, l.employee_id)}</td><td>{LEAVE_TYPES[l.type]}</td><td>{fmtDate(l.start)} – {fmtDate(l.end)}</td><td>{l.days}</td><td className="text-muted">−{lost} saat</td>
                        <td><Chip tone={l.status === 'approved' ? 'ok' : l.status === 'rejected' ? 'bad' : 'warn'}>{l.status === 'approved' ? 'Onaylı' : l.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}</Chip></td>
                        <td className="whitespace-nowrap text-right">{decide && l.status === 'pending' && <><button className="btn btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideLeave(l.id, 'approved'))}>Onayla</button> <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void act(() => repo!.decideLeave(l.id, 'rejected'))}>Reddet</button></>}</td></tr>); })}
                  </Table>
                )}
              </Card>
              <FormCard title="İzin talebi" busy={busy} submit="Talep et" fields={[
                { name: 'emp', label: 'Kişi', type: 'select', options: team.map((m) => [m.id, m.name]), def: me?.employee_id }, { name: 'type', label: 'Tür', type: 'select', options: Object.entries(LEAVE_TYPES) },
                { name: 'start', label: 'Başlangıç', type: 'date', def: addDays(mondayOf(today), 14), required: true }, { name: 'end', label: 'Bitiş', type: 'date', def: addDays(mondayOf(today), 14), required: true }, { name: 'note', label: 'Not' }]}
                onSubmit={(v) => { const days = Math.max(1, [...Array(60).keys()].filter((i) => { const x = addDays(String(v.start), i); return x <= String(v.end) && ![0, 6].includes(new Date(`${x}T12:00:00Z`).getUTCDay()); }).length);
                  return act(() => repo!.save('leaves', { employee_id: String(v.emp), type: String(v.type) as keyof typeof LEAVE_TYPES, start: String(v.start), end: String(v.end), days, status: 'pending', note: String(v.note) })); }} />
            </div>
          );
        }
        if (t === 'skills') {
          const names = [...new Set(d.skills.map((s) => s.skill))].sort();
          return (
            <div className="grid gap-4">
              <Card title="Yetkinlik havuzu">
                {names.length === 0 ? <Empty>Kayıtlı yetkinlik yok.</Empty> : <div className="grid gap-3 sm:grid-cols-2">{names.map((n) => (
                  <div key={n} className="nested"><strong className="text-sm">{n}</strong><div className="mt-2 flex flex-wrap gap-1.5">{d.skills.filter((s) => s.skill === n).sort((a, b) => b.level - a.level).map((s) => <Chip key={s.id} tone={s.level >= 5 ? 'ok' : undefined}>{nameOf(d.team, s.employee_id).split(' ')[0]} · {'★'.repeat(s.level)}</Chip>)}</div></div>
                ))}</div>}
              </Card>
              <Crud kind="skills" title="Yetkinlik" rows={d.skills} canEdit={can.write('skills')} empty="Yetkinlik yok." heads={['Kişi', 'Yetkinlik', 'Seviye']} cells={(r) => [nameOf(d.team, r.employee_id), r.skill, '★'.repeat(r.level)]}
                fields={[{ name: 'emp', label: 'Kişi', type: 'select', options: team.map((m) => [m.id, m.name]) }, { name: 'skill', label: 'Yetkinlik', required: true }, { name: 'level', label: 'Seviye (1–5)', type: 'number', def: 3 }]}
                build={(v) => ({ employee_id: String(v.emp), skill: String(v.skill), level: Math.min(5, Math.max(1, Number(v.level))) })} />
            </div>
          );
        }
        if (t === 'equipment') {
          return (
            <div className="grid gap-4">{Err}{conflict && <p role="alert" className="text-sm text-magenta">{conflict}</p>}
              <Crud kind="equipment" title="Ekipman" rows={d.equipment} canEdit={can.write('equipment')} empty="Ekipman yok." heads={['Ekipman', 'Kategori', 'Durum', 'Rezervasyonlar']}
                cells={(r) => [<strong key="n">{r.name}</strong>, r.category, <Chip key="s" tone={r.status === 'available' ? 'ok' : 'warn'}>{r.status === 'available' ? 'Kullanılabilir' : 'Bakımda'}</Chip>,
                  d.equipment_bookings.filter((b) => b.equipment_id === r.id).map((b) => <div key={b.id} className="text-xs text-muted">{fmtDate(b.start)}–{fmtDate(b.end)} · {nameOf(d.team, b.employee_id).split(' ')[0]}</div>)]}
                fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'cat', label: 'Kategori' }]} build={(v) => ({ name: String(v.name), category: String(v.cat), status: 'available' as const })} />
              <FormCard title="Rezervasyon" busy={busy} submit="Rezerve et" fields={[
                { name: 'eq', label: 'Ekipman', type: 'select', options: d.equipment.filter((e) => e.status === 'available').map((e) => [e.id, e.name]) }, { name: 'emp', label: 'Kişi', type: 'select', options: team.map((m) => [m.id, m.name]), def: me?.employee_id },
                { name: 'start', label: 'Başlangıç', type: 'date', def: today, required: true }, { name: 'end', label: 'Bitiş', type: 'date', def: today, required: true }]}
                onSubmit={(v) => {
                  const clash = d.equipment_bookings.find((b) => b.equipment_id === v.eq && b.start <= String(v.end) && b.end >= String(v.start));
                  if (clash) { setConflict(`Çakışma: bu ekipman ${fmtDate(clash.start)}–${fmtDate(clash.end)} arasında ${nameOf(d.team, clash.employee_id)} için rezerve.`); return; }
                  setConflict(null); return act(() => repo!.save('equipment_bookings', { equipment_id: String(v.eq), employee_id: String(v.emp), start: String(v.start), end: String(v.end), project_id: null }));
                }} />
            </div>
          );
        }
        return (
          <Crud kind="rate_cards" title="Rate card" rows={d.rate_cards} canEdit={can.write('rate_cards')} empty="Rate card yok." heads={['Ad', 'Disiplin', 'Seviye', 'Birim', 'Ücret', 'Durum']}
            cells={(r) => [<strong key="n">{r.name}</strong>, r.discipline, r.level, r.unit, `${new Intl.NumberFormat('tr-TR').format(r.rate_minor / 100)} ₺`, <Chip key="s" tone={r.status === 'active' ? 'ok' : undefined}>{r.status === 'active' ? 'Aktif' : 'Durdu'}</Chip>]}
            fields={[{ name: 'name', label: 'Ad', required: true }, { name: 'disc', label: 'Disiplin' }, { name: 'level', label: 'Seviye', type: 'select', options: [['junior', 'Junior'], ['mid', 'Mid'], ['senior', 'Senior']] }, { name: 'unit', label: 'Birim', type: 'select', options: [['saat', 'Saat'], ['gün', 'Gün'], ['iş', 'İş']] }, { name: 'rate', label: 'Ücret (₺)', type: 'number', def: 1000 }]}
            build={(v) => ({ name: String(v.name), discipline: String(v.disc), level: String(v.level) as 'mid', unit: String(v.unit) as 'gün', rate_minor: Math.round(Number(v.rate) * 100), status: 'active' as const })} />
        );
      }}</Await>}
    </ModulePage>
  );
}
