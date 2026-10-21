'use client';
import { useCallback, useId, useRef, useState } from 'react';
import type { AuditEvent, Task, TaskBadges, TaskCover, TaskPatch, TeamMember } from '@jscore/contracts';
import { useSession } from '../session';
import { ActivitySection, CoverSection, DescriptionSection } from './extras-basic';
import { ChecklistSection } from './extras-checklist';
import { CommentsSection } from './extras-comments';
import { FilesSection } from './extras-files';
import { useTaskExtras } from './use-task-extras';

type Tab = 'description' | 'checklist' | 'comments' | 'files' | 'cover' | 'activity';

/**
 * Görev ayrıntı sekmeleri (Trello kartı özellikleri): Açıklama · Checklist · Yorumlar · Dosyalar · Kapak · Aktivite.
 * ARIA sekme deseni: ok tuşları / Home / End ile gezinme, yalnızca etkin panel DOM'da.
 */
export function TaskExtras({ task, team, activity, readonly, pending, onPatch, onBadges, onLocalPatch }: {
  task: Task; team: TeamMember[]; activity: AuditEvent[] | null; readonly: boolean; pending: boolean;
  onPatch: (p: TaskPatch) => void; onBadges: (taskId: string, b: TaskBadges) => void; onLocalPatch: (taskId: string, p: Partial<Task>) => void;
}) {
  const { repo, me } = useSession();
  const id = useId();
  const [tab, setTab] = useState<Tab>('description');
  const x = useTaskExtras(repo, task.id, onBadges);
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const clearCover = useCallback(() => onLocalPatch(task.id, { cover: {} }), [onLocalPatch, task.id]);
  const items = (x.lists ?? []).flatMap((l) => l.items);
  const tabs: Array<[Tab, string, string?]> = [
    ['description', 'Açıklama', task.description?.trim() ? '•' : undefined],
    ['checklist', 'Checklist', items.length ? `${items.filter((i) => i.checked).length}/${items.length}` : undefined],
    ['comments', 'Yorumlar', x.comments?.length ? String(x.comments.length) : undefined],
    ['files', 'Dosyalar', x.files?.length ? String(x.files.length) : undefined],
    ['cover', 'Kapak', task.cover?.color || task.cover?.attachment_id ? '•' : undefined],
    ['activity', 'Aktivite'],
  ];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = tabs[(n + tabs.length) % tabs.length][0];
    setTab(next);
    requestAnimationFrame(() => refs.current[next]?.focus());
  };
  const canEdit = !readonly && !!repo;
  return (
    <section className="wk-detail-section wk-x" aria-label="Görev ayrıntıları">
      <div role="tablist" aria-label="Görev ayrıntı bölümleri" className="wk-x-tabs">
        {tabs.map(([k, label, badge], i) => (
          <button key={k} ref={(el) => { refs.current[k] = el; }} type="button" role="tab" id={`${id}-t-${k}`} aria-selected={tab === k} aria-controls={`${id}-p-${k}`} tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)} onKeyDown={(e) => onKey(e, i)}>{label}{badge && <span className="wk-x-count" aria-hidden={badge === '•'}>{badge}</span>}{badge === '•' && <span className="wk-sr"> var</span>}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p-${tab}`} aria-labelledby={`${id}-t-${tab}`} tabIndex={0} className="wk-x-panel">
        {x.loadError && <p role="alert" className="wk-detail-note" data-tone="error">Ayrıntılar yüklenemedi: {x.loadError}</p>}
        {!x.loaded && !x.loadError && tab !== 'description' && tab !== 'activity' && <p className="wk-muted" role="status">Yükleniyor…</p>}
        {tab === 'description' && <DescriptionSection task={task} canEdit={canEdit} pending={pending} onSave={(description) => onPatch({ description })} />}
        {tab === 'checklist' && x.loaded && repo && <ChecklistSection x={x} repo={repo} taskId={task.id} team={team} canEdit={canEdit} />}
        {tab === 'comments' && x.loaded && repo && <CommentsSection x={x} repo={repo} taskId={task.id} me={me} canEdit={canEdit} />}
        {tab === 'files' && x.loaded && repo && <FilesSection x={x} repo={repo} taskId={task.id} canEdit={canEdit} coverId={task.cover?.attachment_id} onCoverCleared={clearCover} />}
        {tab === 'cover' && repo && <CoverSection task={task} x={x} repo={repo} canEdit={canEdit && !pending} onCover={(c: TaskCover) => onPatch({ cover: c })} />}
        {tab === 'activity' && <ActivitySection audit={activity} x={x} />}
      </div>
    </section>
  );
}
