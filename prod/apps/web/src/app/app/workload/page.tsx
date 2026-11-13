'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { leastLoaded, weekRange, workloadRows, type Task } from '@jscore/contracts';
import { Avatar } from '@/components/avatar';
import { Bar, Card, Chip, ModulePage, toneOf } from '@/components/mod';
import { useSession } from '@/components/session';
import { useToast } from '@/components/toasts';
import { Async, Empty, fmtDate, todayFor, useData } from '@/components/ui';
import { isOverdue } from '@/components/work/work-utils';

/** Ekip → İş yükü (0017): kişi başına haftalık kapasite (weekly_hours×60) ve bu haftaya düşen planlanan dakika, gecikenler; seçimle yeniden atama. */
export default function WorkloadPage() {
  const { repo, mode, me } = useSession();
  const toast = useToast();
  const q = useData(async (r) => ({ tasks: await r.listTasks(), team: await r.team(), projects: await r.listProjects().catch(() => []) }));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (q.data) setTasks(q.data.tasks); }, [q.data]);
  const today = todayFor(mode);
  const { start, end } = weekRange(today);
  const canEdit = !!me && ['owner', 'org_admin', 'operations', 'account', 'pm', 'hr'].includes(me.role);
  const reassign = async (t: Task, to: string | null) => {
    if (!repo) return;
    try { const n = await repo.updateTask(t.id, { assignee_id: to }); setTasks((ts) => ts.map((x) => (x.id === n.id ? n : x))); toast.success('Yeniden atandı', n.title); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Atanamadı'); }
  };
  return (
    <ModulePage id="workload" title="İş yükü" sub={`Bu hafta: ${fmtDate(start)} – ${fmtDate(end)} · kapasite = haftalık saat × 60 dk; planlanan = bu hafta biten (ya da gecikmiş) açık görevlerin planlanan dakikası`} tabs={[['week', 'Bu hafta']]}>
      {() => (
        <Async q={q}>{({ team, projects }) => {
          const rows = workloadRows(tasks, team, today);
          const totalCap = rows.reduce((a, r) => a + r.capacity_min, 0); const totalPlan = rows.reduce((a, r) => a + r.planned_min, 0);
          const over = rows.filter((r) => r.pct > 100).length;
          const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
          return (
            <div className="grid gap-4">
              {err && <p role="alert" className="text-sm text-magenta">{err}</p>}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="metric"><div className="metric-top"><span>Ekip kapasitesi</span></div><div className="metric-value">{Math.round(totalCap / 60)} sa</div></div>
                <div className="metric"><div className="metric-top"><span>Planlanan</span></div><div className={`metric-value ${totalPlan > totalCap ? 'text-magenta' : ''}`}>{Math.round(totalPlan / 60)} sa</div><div className="metric-note">%{totalCap ? Math.round((totalPlan / totalCap) * 100) : 0} doluluk</div></div>
                <div className="metric"><div className="metric-top"><span>Aşırı yüklü</span></div><div className={`metric-value ${over ? 'text-magenta' : 'text-[#3ddc97]'}`}>{over}</div><div className="metric-note">%100 üzeri</div></div>
                <div className="metric"><div className="metric-top"><span>Geciken</span></div><div className="metric-value">{rows.reduce((a, r) => a + r.overdue, 0)}</div></div>
              </div>
              {rows.length === 0 ? <Empty>Aktif çalışan yok.</Empty> : (
                <Card title="Kişiler">
                  <ul className="home-list" aria-label="İş yükü">
                    {rows.map((r) => (
                      <li key={r.member.id}>
                        <button type="button" className="home-row w-full text-left" aria-expanded={openId === r.member.id} onClick={() => setOpenId(openId === r.member.id ? null : r.member.id)}>
                          <Avatar id={r.member.id} name={r.member.name} size="sm" />
                          <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{r.member.name}</span><span className="ml-2 text-xs text-muted">{r.member.role_title}{r.member.team ? ` · ${r.member.team}` : ''}</span></span>
                          <span className="hidden text-xs text-muted sm:inline">{Math.round(r.planned_min / 60)} / {Math.round(r.capacity_min / 60)} sa</span>
                          <div className="w-28"><Bar pct={Math.min(r.pct, 150)} tone={toneOf(r.pct)} /></div>
                          <Chip tone={toneOf(r.pct)}>%{r.pct}</Chip>
                          <Chip tone={r.overdue ? 'bad' : undefined}>{r.overdue ? `${r.overdue} gecikmiş` : `${r.open} açık`}</Chip>
                        </button>
                        {openId === r.member.id && (
                          <div className="nested mt-1">
                            {r.week.length === 0 ? <p className="text-sm text-muted">Bu haftaya düşen görev yok.</p> : (
                              <table className="table"><thead><tr><th>Görev</th><th>Proje</th><th>Bitiş</th><th>Süre</th>{canEdit && <th>Yeniden ata</th>}</tr></thead><tbody>
                                {r.week.map((t) => (
                                  <tr key={t.id}>
                                    <td><Link className="hover:underline" href={`/app/projects/${t.project_id}?task=${t.id}`}>{t.title}</Link></td><td className="text-muted">{projName(t.project_id)}</td>
                                    <td><span className={`chip ${isOverdue(t, today) ? 'chip-bad' : ''}`}>{fmtDate(t.due_at)}</span></td><td>{t.planned_minutes ? `${Math.round((t.planned_minutes / 60) * 10) / 10} sa` : '—'}</td>
                                    {canEdit && <td><select className="input w-auto py-1" aria-label={`${t.title} sorumlusu`} value={t.assignee_id ?? ''} onChange={(e) => void reassign(t, e.target.value || null)}>
                                      <option value="">Atanmamış</option>{team.filter((m) => m.status === 'active').map((m) => { const row = rows.find((x) => x.member.id === m.id); return <option key={m.id} value={m.id}>{m.name}{row ? ` (%${row.pct})` : ''}</option>; })}
                                    </select></td>}
                                  </tr>
                                ))}
                              </tbody></table>
                            )}
                            {canEdit && r.pct > 100 && leastLoaded(rows, r.member.id) && <p className="mt-2 text-xs text-muted">Öneri: en düşük yüklü kişi <strong>{leastLoaded(rows, r.member.id)!.name}</strong>.</p>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <p className="text-xs text-muted">Yalnızca kişiler listelenir (Kurul ajanları yok). Tarihsiz görevler bu hafta sayılmaz; kapasite planı için <Link className="underline" href="/app/resources">Kaynaklar</Link>.</p>
            </div>
          );
        }}</Async>
      )}
    </ModulePage>
  );
}
