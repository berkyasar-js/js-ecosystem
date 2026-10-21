'use client';
import { useEffect, useState } from 'react';
import type { Task, TimeEntry } from '@jscore/contracts';
import { Empty, PRIORITY, fmtDate, todayFor } from '../ui';
import { useSession } from '../session';
import { Await, Card, Chip, CsvButton, FormCard, Grid, ModulePage, Table, brandName, nameOf, useAct, useWorld } from '../mod';
import { addDays, mondayOf } from '@/lib/domain';
import { MyTasks } from '../work/MyTasks';
import { byDue, dueDay, isOverdue } from '../work/work-utils';

const TABS: Array<[string, string]> = [['day', 'Benim günüm'], ['week', 'Haftam'], ['time', 'Zaman girişleri'], ['notifications', 'Bildirimler']];
const hm = (min: number) => `${Math.floor(min / 60)}s ${String(min % 60).padStart(2, '0')}dk`;

export function MyWorkView({ tab }: { tab?: string }) {
  const { me, mode, repo } = useSession();
  const q = useWorld(['time_entries', 'notifications', 'task_requests']);
  const { act, busy, Err } = useAct();
  const today = todayFor(mode);
  const emp = me?.employee_id ?? '';
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  return (
    <ModulePage id="mywork" title="Benim İşlerim" sub="Görevlerim, zaman girişi ve bildirimler" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{(d) => {
        const mine = d.tasks.filter((x) => x.assignee_id === emp && x.state !== 'archive');
        const entries = d.time_entries.filter((e) => e.employee_id === emp);
        const running = entries.find((e) => e.started_at && !e.ended_at);
        const reqs = d.task_requests.filter((r) => r.employee_id === emp);
        const taskLabel = (id: string | null) => (id ? d.tasks.find((x) => x.id === id)?.title ?? id : 'Genel');
        const request = (task: Task, kind: 'snooze' | 'reschedule' | 'help', note: string, new_due: string | null, to: string | null) =>
          act(async () => {
            await repo!.save('task_requests', { task_id: task.id, employee_id: emp, kind, note, new_due, to_employee: to, status: 'open' });
            if (to) await repo!.save('notifications', { employee_id: to, kind: 'task', title: `Yardım isteği: ${task.title}`, body: note || 'Destek isteniyor', read: false });
          });

        if (!emp) return <Empty>Bu hesap bir çalışan kaydına bağlı değil; kişisel iş listesi yok.</Empty>;
        if (t === 'day') {
          const due = mine.filter((x) => { const dd = dueDay(x); return !!dd && dd <= addDays(today, 2); }).sort(byDue);
          const todayMin = entries.filter((e) => e.worked_on === today).reduce((s, e) => s + e.minutes, 0);
          return (
            <div className="grid gap-4">{Err}
              <Grid cols={3}>
                <Card title="Bugün"><div className="text-3xl font-bold">{due.filter((x) => { const dd = dueDay(x); return !!dd && dd <= today; }).length}</div><p className="text-xs text-muted">teslimi bugün/geçmiş görev</p></Card>
                <Card title="Kayıtlı süre"><div className="text-3xl font-bold">{hm(todayMin)}</div><p className="text-xs text-muted">{running ? 'Zamanlayıcı çalışıyor' : 'Zamanlayıcı kapalı'}</p></Card>
                <Card title="Bekleyen taleplerim"><div className="text-3xl font-bold">{reqs.filter((r) => r.status === 'open').length}</div><p className="text-xs text-muted">erteleme / yardım</p></Card>
              </Grid>
              <MyTasks allTasks={d.tasks} employeeId={emp} team={d.team} projects={d.projects} today={today} />
              <Card title="Önümüzdeki 48 saat">
                {due.length === 0 ? <Empty>Yaklaşan teslim yok. Güzel gün.</Empty> : (
                  <ul className="grid gap-3">
                    {due.map((x) => {
                      const late = isOverdue(x, today); const open = reqs.filter((r) => r.task_id === x.id && r.status === 'open');
                      return (
                        <li key={x.id} className="nested grid gap-2">
                          <div className="flex flex-wrap items-center gap-2"><strong className="text-[13px]">{x.title}</strong><Chip tone={PRIORITY[x.priority][1].includes('bad') ? 'bad' : undefined}>{PRIORITY[x.priority][0]}</Chip><Chip tone={late ? 'bad' : undefined}>{fmtDate(x.due_at)}</Chip>{open.map((r) => <Chip key={r.id} tone="warn">{r.kind === 'help' ? 'Yardım istendi' : 'Erteleme talebi'}</Chip>)}</div>
                          <div className="flex flex-wrap gap-2">
                            <button className="btn btn-sm" disabled={busy} onClick={() => void request(x, 'snooze', '1 gün ertele', addDays(dueDay(x) ?? today, 1), null)}>Ertele (+1 gün)</button>
                            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('d')); if (v) void request(x, 'reschedule', 'Yeniden planlama', v, null); }}>
                              <input name="d" type="date" className="input min-h-8 w-auto py-0 text-xs" aria-label="Yeni tarih" min={today} required /><button className="btn btn-sm">Yeniden planla</button>
                            </form>
                            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void request(x, 'help', String(f.get('n') ?? ''), null, String(f.get('who'))); }}>
                              <select name="who" className="input min-h-8 w-auto py-0 text-xs" aria-label="Kimden yardım">{d.team.filter((m) => m.id !== emp).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                              <input name="n" className="input min-h-8 w-40 py-0 text-xs" placeholder="Not" aria-label="Yardım notu" /><button className="btn btn-sm">Yardım iste</button>
                            </form>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              {reqs.length > 0 && <Card title="Taleplerim"><Table heads={['Görev', 'Tür', 'Not', 'Durum']}>{reqs.map((r) => <tr key={r.id}><td>{taskLabel(r.task_id)}</td><td>{r.kind}</td><td className="text-muted">{r.note}{r.new_due ? ` → ${fmtDate(r.new_due)}` : ''}{r.to_employee ? ` · ${nameOf(d.team, r.to_employee)}` : ''}</td><td><Chip tone={r.status === 'open' ? 'warn' : 'ok'}>{r.status === 'open' ? 'Açık' : 'Tamam'}</Chip></td></tr>)}</Table></Card>}
            </div>
          );
        }
        if (t === 'week') {
          const mon = mondayOf(today); const days = Array.from({ length: 5 }, (_, i) => addDays(mon, i));
          return (
            <div className="grid gap-3 md:grid-cols-5">
              {days.map((day, i) => {
                const list = mine.filter((x) => dueDay(x) === day); const logged = entries.filter((e) => e.worked_on === day).reduce((s, e) => s + e.minutes, 0);
                return (
                  <section key={day} className={`card ${day === today ? 'border-accent' : ''}`} aria-label={fmtDate(day)}>
                    <h2 className="text-xs font-bold uppercase text-muted">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum'][i]} · {fmtDate(day)}</h2>
                    <div className="mt-2 grid gap-2">{list.length === 0 ? <p className="text-xs text-muted">Teslim yok</p> : list.map((x) => <div key={x.id} className="nested text-xs"><strong>{x.title}</strong><div className="text-muted">{brandName(d.brands, d.projects.find((p) => p.id === x.project_id)?.brand_id)} · {hm(x.planned_minutes)}</div></div>)}</div>
                    <p className="mt-2 text-xs text-muted">Kayıtlı: {hm(logged)}</p>
                  </section>
                );
              })}
            </div>
          );
        }
        if (t === 'time') {
          void tick;
          const elapsed = running?.started_at ? Math.max(0, Math.floor((Date.now() - new Date(running.started_at).getTime()) / 1000)) : 0;
          const sorted = [...entries].sort((a, b) => b.worked_on.localeCompare(a.worked_on));
          const total = entries.reduce((s, e) => s + e.minutes, 0);
          const taskOpts: Array<[string, string]> = [['', 'Genel (görevsiz)'], ...mine.map((x) => [x.id, x.title] as [string, string])];
          const stop = (e: TimeEntry) => act(() => {
            const mins = Math.max(1, Math.round((Date.now() - new Date(e.started_at as string).getTime()) / 60000));
            return repo!.save('time_entries', { id: e.id, minutes: mins, ended_at: new Date().toISOString() });
          });
          return (
            <div className="grid gap-4">{Err}
              <Card title="Zamanlayıcı">
                {running ? (
                  <div className="flex flex-wrap items-center gap-3"><span className="text-3xl font-bold tabular-nums" role="timer" aria-live="off">{String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span><span className="text-sm text-muted">{taskLabel(running.task_id)} — {running.note}</span><button className="btn btn-accent" disabled={busy} onClick={() => void stop(running)}>Durdur</button></div>
                ) : (
                  <FormCard fields={[{ name: 'task', label: 'Görev', type: 'select', options: taskOpts }, { name: 'note', label: 'Not' }]} submit="Başlat" busy={busy}
                    onSubmit={(v) => act(() => repo!.save('time_entries', { employee_id: emp, task_id: v.task ? String(v.task) : null, minutes: 0, note: String(v.note), worked_on: today, started_at: new Date().toISOString(), ended_at: null }))} />
                )}
              </Card>
              <FormCard title="Manuel giriş" busy={busy} submit="Ekle" fields={[{ name: 'task', label: 'Görev', type: 'select', options: taskOpts }, { name: 'date', label: 'Tarih', type: 'date', def: today, required: true }, { name: 'minutes', label: 'Süre (dk)', type: 'number', def: 60, required: true }, { name: 'note', label: 'Not' }]}
                onSubmit={(v) => Number(v.minutes) > 0 && act(() => repo!.save('time_entries', { employee_id: emp, task_id: v.task ? String(v.task) : null, minutes: Number(v.minutes), note: String(v.note), worked_on: String(v.date), started_at: null, ended_at: null }))} />
              <Card title={`Girişlerim · toplam ${hm(total)}`} aside={<CsvButton name="zaman-girisleri.csv" rows={[['Tarih', 'Görev', 'Dakika', 'Not'], ...sorted.map((e) => [e.worked_on, taskLabel(e.task_id), e.minutes, e.note])]} />}>
                {sorted.length === 0 ? <Empty>Henüz zaman girişi yok.</Empty> : <Table heads={['Tarih', 'Görev', 'Süre', 'Not']}>{sorted.map((e) => <tr key={e.id}><td>{fmtDate(e.worked_on)}</td><td>{taskLabel(e.task_id)}</td><td>{e.started_at && !e.ended_at ? <Chip tone="warn">çalışıyor</Chip> : hm(e.minutes)}</td><td className="text-muted">{e.note}</td></tr>)}</Table>}
              </Card>
            </div>
          );
        }
        const notes = d.notifications.filter((n) => n.employee_id === emp).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return (
          <div className="grid gap-3">{Err}
            <div className="flex justify-between"><span className="chip">{notes.filter((n) => !n.read).length} okunmamış</span><button className="btn btn-sm" disabled={busy} onClick={() => void act(async () => { for (const n of notes.filter((x) => !x.read)) await repo!.save('notifications', { id: n.id, read: true }); })}>Tümünü okundu yap</button></div>
            {notes.length === 0 ? <Empty>Bildirim yok.</Empty> : notes.map((n) => (
              <div key={n.id} className="card flex flex-wrap items-center gap-3" style={{ opacity: n.read ? 0.65 : 1 }}>
                <div className="min-w-0 flex-1"><div className="font-semibold">{n.title}</div><div className="text-xs text-muted">{n.body}</div></div>
                {n.href && <a className="btn btn-sm" href={n.href}>Aç</a>}{!n.read && <button className="btn btn-sm" onClick={() => void act(() => repo!.save('notifications', { id: n.id, read: true }))}>Okundu</button>}
              </div>
            ))}
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}
