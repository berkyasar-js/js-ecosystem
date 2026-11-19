'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CalendarCheck, CalendarDays, CalendarRange, Flag, SquareKanban } from 'lucide-react';
import { agendaDays, mergeCalendarIntoAgenda, type CalendarEvent, type GoogleUserState, type Milestone } from '@jscore/contracts';
import { Card, Chip, ModulePage } from '@/components/mod';
import { useSession } from '@/components/session';
import { Async, Empty, fmtDate, todayFor, useData } from '@/components/ui';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';
const DOW = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

interface CalRes { events: CalendarEvent[]; me: boolean; org: boolean; errors: string[] }
const getJson = async <T,>(url: string): Promise<T | null> => { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } };

/** Ajanda (0017 + 0021): gün / hafta görünümü — bana atanan görevler (bitiş), kilometre taşları ve Google Takvim etkinlikleri (kişisel + ajans takvimi, salt okunur). */
export default function AgendaPage() {
  const { me, mode } = useSession();
  const qs = useSearchParams();
  const [range, setRange] = useState<'day' | 'week' | 'two'>('week');
  const [all, setAll] = useState(false);
  const today = todayFor(mode);
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const supa = r.mode === 'supabase';
    const [tasks, milestones, projects, google, cal] = await Promise.all([
      safe(r.listTasks()), safe(r.list('milestones')), safe(r.listProjects()),
      supa ? getJson<GoogleUserState>('/api/integrations/google') : Promise.resolve(null),
      supa ? getJson<CalRes>(`/api/integrations/google/calendar?days=14&today=${today}`) : Promise.resolve(null),
    ]);
    return { tasks, milestones: milestones as Milestone[], projects, google, cal };
  }, [today]);
  const oauthMsg = qs.get('google') === 'ok' ? `Google Takvim bağlandı (${qs.get('email') ?? ''}).` : qs.get('google') === 'error' ? `Google bağlantısı başarısız: ${qs.get('msg') ?? ''}` : null;
  return (
    <ModulePage id="agenda" title="Ajanda" sub="Görevlerin, kilometre taşları ve takvim tek görünümde" tabs={[['agenda', 'Ajanda']]}
      actions={<div className="flex gap-2">
        {([['day', 'Bugün', CalendarDays], ['week', 'Bu hafta', CalendarRange], ['two', '14 gün', CalendarRange]] as const).map(([k, l, Icon]) => <button key={k} className={`btn btn-sm ${range === k ? 'btn-primary' : ''}`} aria-pressed={range === k} onClick={() => setRange(k)}><Icon size={14} aria-hidden /> {l}</button>)}
        {me?.employee_id && <button className="btn btn-sm" aria-pressed={all} onClick={() => setAll((v) => !v)}>{all ? 'Tüm ekip' : 'Yalnızca ben'}</button>}
      </div>}>
      {() => (
        <Async q={q}>{({ tasks, milestones, projects, google, cal }) => {
          const n = range === 'day' ? 1 : range === 'week' ? 7 : 14;
          const base = agendaDays({ tasks, milestones, employeeId: all ? null : me?.employee_id, today, days: n, projectName: (id) => projects.find((p) => p.id === id)?.name ?? '' });
          const days = cal ? mergeCalendarIntoAgenda(base, cal.events) : base;
          const total = days.reduce((a, d) => a + d.items.length, 0);
          const connected = !!google?.connected;
          const status = mode === 'demo' ? 'Demo modu: takvim Supabase ile bağlanır.' : connected
            ? `Bağlı · ${google?.email}${cal?.org ? ' · ajans takvimi dahil' : ''}${cal?.errors.length ? ` · ${cal.errors[0]}` : ''}`
            : cal?.org ? 'Kişisel takvimin bağlı değil; ajans takvimi (hello@) gösteriliyor.' : google && !google.env_ready ? 'Google OAuth env’i tanımlı değil (GOOGLE_CLIENT_ID / SECRET).' : 'Bağlı değil. Toplantılarını görevlerinle yan yana görmek için Google Takvim’i bağla (salt okunur).';
          return (
            <div className="grid gap-4">
              {oauthMsg && <p role="status" className={`text-sm ${qs.get('google') === 'ok' ? 'text-muted' : 'text-magenta'}`}>{oauthMsg}</p>}
              <section className="card flex flex-wrap items-center justify-between gap-3" aria-label="Takvim bağlantısı">
                <div className="flex items-center gap-3"><span className="signal-icon">{connected ? <CalendarCheck size={16} aria-hidden /> : <CalendarDays size={16} aria-hidden />}</span>
                  <div><strong>Google Takvim</strong><p className="text-sm text-muted">{status}</p></div></div>
                <div className="flex flex-wrap gap-2">
                  {mode === 'supabase' && (connected
                    ? <Link className="btn btn-sm" href="/app/profile?tab=google">Bağlantıyı yönet</Link>
                    : <a className="btn btn-sm" href="/api/integrations/google/connect?return=/app/agenda">Google Takvim’i bağla</a>)}
                  {ADMIN_URL && me && (me.role === 'owner' || me.role === 'org_admin') && <a className="btn btn-ghost btn-sm" href={`${ADMIN_URL}/admin/integrations`} target="_blank" rel="noreferrer">Ajans takvimi (panel)</a>}
                </div>
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
                                <Link href={it.href ?? '#'} className="home-row" target={it.kind === 'calendar' && it.href ? '_blank' : undefined} rel={it.kind === 'calendar' ? 'noreferrer' : undefined}>
                                  {it.kind === 'milestone' ? <Flag size={14} aria-hidden className="text-[#ffb020]" /> : it.kind === 'calendar' ? <CalendarDays size={14} aria-hidden className="text-[var(--brand-ink)]" /> : <SquareKanban size={14} aria-hidden />}
                                  <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{it.title}</span>{it.meta && <span className="ml-2 text-xs text-muted">{it.meta}</span>}</span>
                                  {it.overdue && <Chip tone="bad">Gecikmiş</Chip>}{it.kind === 'milestone' && <Chip tone="warn">Kilometre taşı</Chip>}{it.kind === 'calendar' && <Chip>Takvim</Chip>}
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
