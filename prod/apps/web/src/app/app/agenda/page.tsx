'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CalendarDays, CalendarRange, Flag, SquareKanban } from 'lucide-react';
import { agendaDays, type Milestone } from '@jscore/contracts';
import { Card, Chip, ModulePage } from '@/components/mod';
import { useSession } from '@/components/session';
import { Async, Empty, fmtDate, todayFor, useData } from '@/components/ui';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';
const DOW = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** Ajanda (0017): gün / hafta görünümü — bana atanan görevler (bitiş), kilometre taşları; Google Takvim bağlıysa etkinlikler (OAuth sonraki adım). */
export default function AgendaPage() {
  const { me, mode } = useSession();
  const [range, setRange] = useState<'day' | 'week' | 'two'>('week');
  const [all, setAll] = useState(false);
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [tasks, milestones, projects, connect] = await Promise.all([safe(r.listTasks()), safe(r.list('milestones')), safe(r.listProjects()), r.getConnect().catch(() => null)]);
    const google = connect?.integrations.find((i) => i.provider === 'google');
    return { tasks, milestones: milestones as Milestone[], projects, googleConnected: google?.status === 'connected' && google.scopes.includes('calendar') };
  });
  const today = todayFor(mode);
  return (
    <ModulePage id="agenda" title="Ajanda" sub="Görevlerin, kilometre taşları ve takvim tek görünümde" tabs={[['agenda', 'Ajanda']]}
      actions={<div className="flex gap-2">
        {([['day', 'Bugün', CalendarDays], ['week', 'Bu hafta', CalendarRange], ['two', '14 gün', CalendarRange]] as const).map(([k, l, Icon]) => <button key={k} className={`btn btn-sm ${range === k ? 'btn-primary' : ''}`} aria-pressed={range === k} onClick={() => setRange(k)}><Icon size={14} aria-hidden /> {l}</button>)}
        {me?.employee_id && <button className="btn btn-sm" aria-pressed={all} onClick={() => setAll((v) => !v)}>{all ? 'Tüm ekip' : 'Yalnızca ben'}</button>}
      </div>}>
      {() => (
        <Async q={q}>{({ tasks, milestones, projects, googleConnected }) => {
          const days = agendaDays({ tasks, milestones, employeeId: all ? null : me?.employee_id, today, days: range === 'day' ? 1 : range === 'week' ? 7 : 14, projectName: (id) => projects.find((p) => p.id === id)?.name ?? '' });
          const total = days.reduce((a, d) => a + d.items.length, 0);
          return (
            <div className="grid gap-4">
              <section className="card flex flex-wrap items-center justify-between gap-3" aria-label="Takvim bağlantısı">
                <div className="flex items-center gap-3"><span className="signal-icon"><CalendarDays size={16} aria-hidden /></span>
                  <div><strong>Google Takvim</strong><p className="text-sm text-muted">{googleConnected ? 'Bağlı · etkinlikler bir sonraki sürümde bu görünüme akacak (OAuth yenileme bekleniyor).' : 'Bağlı değil. Toplantılarını görevlerinle yan yana görmek için Google Takvim’i bağla.'}</p></div></div>
                {ADMIN_URL ? <a className="btn btn-sm" href={`${ADMIN_URL}/admin/integrations`} target="_blank" rel="noreferrer">{googleConnected ? 'Entegrasyonlar' : 'Google Takvim’i bağla'}</a> : <span className="text-xs text-muted">Bağlantı Ana Yönetim Paneli → Entegrasyonlar’dan yapılır.</span>}
              </section>
              {total === 0 ? <Empty>{all ? 'Bu aralıkta planlı iş yok.' : 'Bu aralıkta sana düşen iş yok.'}</Empty> : (
                <div className={`grid gap-3 ${range === 'day' ? '' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
                  {days.map((d) => {
                    const dt = new Date(`${d.day}T00:00:00Z`);
                    const isToday = d.day === today;
                    return (
                      <Card key={d.day} title={`${isToday ? 'Bugün · ' : ''}${DOW[dt.getUTCDay()]} ${fmtDate(d.day)}`} aside={<Chip tone={d.items.some((i) => i.overdue) ? 'bad' : d.items.length ? undefined : 'ok'}>{d.items.length || '—'}</Chip>} className={isToday ? 'border-accent' : ''}>
                        {d.items.length === 0 ? <p className="text-sm text-muted">Boş.</p> : (
                          <ul className="home-list">
                            {d.items.map((it) => (
                              <li key={it.id}>
                                <Link href={it.href ?? '#'} className="home-row">
                                  {it.kind === 'milestone' ? <Flag size={14} aria-hidden className="text-[#ffb020]" /> : <SquareKanban size={14} aria-hidden />}
                                  <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{it.title}</span>{it.meta && <span className="ml-2 text-xs text-muted">{it.meta}</span>}</span>
                                  {it.overdue && <Chip tone="bad">Gecikmiş</Chip>}{it.kind === 'milestone' && <Chip tone="warn">Kilometre taşı</Chip>}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }}</Async>
      )}
    </ModulePage>
  );
}
