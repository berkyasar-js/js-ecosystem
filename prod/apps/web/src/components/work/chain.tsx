'use client';
import { useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { TASK_STATE_LABELS, chainOrder, isDepDone, type Task, type TaskLink, type TeamMember } from '@jscore/contracts';
import { useSession } from '../session';
import { fmtDate } from '../ui';
import { isLate, memberName } from './work-utils';

/**
 * "Zincir" görünümü (kritik yol-light): görevler topolojik sırada; engelleyicisi olanlar engelleyicisinin altında girintili.
 * Gantt yok — yalnızca sıra, açık engel sayısı ve geciken halka. Bağ yoksa düz liste.
 */
export function ChainView({ tasks, team, today, onOpen }: { tasks: Task[]; team: TeamMember[]; today: string; onOpen: (taskId: string) => void }) {
  const { repo } = useSession();
  const [links, setLinks] = useState<TaskLink[]>([]);
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    repo.list('task_links').then((l) => { if (alive) setLinks(l); }, () => undefined);
    return () => { alive = false; };
  }, [repo, tasks.length]);
  const rows = useMemo(() => chainOrder(tasks, links), [tasks, links]);
  const linked = rows.filter((r) => r.blockedBy.length > 0 || links.some((l) => l.kind === 'blocks' && l.from_task_id === r.task.id && tasks.some((t) => t.id === l.to_task_id))).length;
  const blocked = rows.filter((r) => r.blockers > 0).length;
  const openRows = rows.filter((r) => !isDepDone(r.task));
  return (
    <div className="wk-pad">
      <section className="wk-box" aria-label="Zincir görünümü">
        <h3>Zincir</h3>
        <p className="wk-muted" style={{ fontSize: 12, marginBottom: 10 }}>{linked ? `${linked} görev bağımlılık zincirinde · ${blocked} engelli` : 'Bu projede bağımlılık yok. Görev ayrıntısındaki “Bağımlılıklar” bölümünden bağ ekle.'} Sıra: önce yapılması gerekenler üstte, bağımlı görevler altında girintili.</p>
        {openRows.length === 0 ? <p className="wk-muted">Açık görev yok.</p> : (
          <ol className="wk-chain">
            {openRows.map((r) => {
              const late = isLate(r.task, today);
              const by = r.blockedBy.map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
              const openBy = by.filter((t) => !isDepDone(t));
              return (
                <li key={r.task.id} style={{ paddingLeft: Math.min(r.depth, 6) * 22 }} data-blocked={r.blockers > 0 || undefined} data-cycle={r.cycle || undefined}>
                  <span className="wk-chain-dot" aria-hidden />
                  <button type="button" className="wk-task-title" data-task-open={r.task.id} onClick={() => onOpen(r.task.id)}>{r.task.title}</button>
                  <span className="wk-chip">{TASK_STATE_LABELS[r.task.state]}</span>
                  {r.blockers > 0 && <span className="wk-chip" data-tone="warn"><Lock size={11} aria-hidden />{r.blockers} engel</span>}
                  {r.cycle && <span className="wk-chip" data-tone="bad">döngü</span>}
                  <span className="wk-muted" style={{ fontSize: 12 }}>{memberName(team, r.task.assignee_id).split(' ')[0]}</span>
                  <span className={`wk-date ${late ? 'late' : ''}`} style={{ fontSize: 12 }}>{fmtDate(r.task.due_at)}</span>
                  {openBy.length > 0 && <span className="wk-muted wk-chain-by" style={{ fontSize: 11 }}>← {openBy.map((t) => t.title).join(', ')}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
