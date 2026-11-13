'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bot, RefreshCw, User, Zap } from 'lucide-react';
import type { ActivityEntry, ActorKind } from '@jscore/contracts';
import { useSession } from './session';
import { fmtTime } from './ui';

const KIND_LABEL: Record<ActorKind, string> = { human: 'Kişi', agent: 'Ajan', trello: 'Trello', system: 'Sistem' };
const KIND_ICON: Record<ActorKind, typeof User> = { human: User, agent: Bot, trello: RefreshCw, system: Zap };

/**
 * Akış: proje ya da görev için birleşik zaman çizelgesi (denetim + yorum + Trello senkron günlüğü), yeni → eski.
 * Veri `Repo.listActivity` (yetkisiz kaynaklar sessizce atlanır). Aktör süzgeci: kişi / ajan / Trello.
 */
export function ActivityFeed({ scope, limit = 60, refreshKey, taskTitle, compact = false }: { scope: { project_id?: string; task_id?: string }; limit?: number; refreshKey?: string; taskTitle?: (id: string) => string | undefined; compact?: boolean }) {
  const { repo, rev } = useSession();
  const [items, setItems] = useState<ActivityEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<ActorKind | 'all'>('all');
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    repo.listActivity({ ...scope, limit }).then((x) => { if (alive) { setItems(x); setErr(null); } }, (e: unknown) => alive && setErr(e instanceof Error ? e.message : 'Akış yüklenemedi'));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, rev, scope.project_id, scope.task_id, limit, refreshKey]);
  if (err) return <p role="alert" className="wk-error">{err}</p>;
  if (!items) return <p className="wk-muted" role="status">Yükleniyor…</p>;
  const shown = kind === 'all' ? items : items.filter((e) => e.actor_kind === kind);
  const kinds = (['human', 'agent', 'trello'] as ActorKind[]).filter((k) => items.some((e) => e.actor_kind === k));
  return (
    <div>
      {!compact && kinds.length > 1 && (
        <div className="wk-chips" style={{ marginBottom: 10 }} role="group" aria-label="Aktör süzgeci">
          <button type="button" className="wk-chip" data-on={kind === 'all' || undefined} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>Hepsi {items.length}</button>
          {kinds.map((k) => <button key={k} type="button" className="wk-chip" data-on={kind === k || undefined} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]} {items.filter((e) => e.actor_kind === k).length}</button>)}
        </div>
      )}
      {shown.length === 0 ? <p className="wk-muted">Henüz hareket yok.</p> : (
        <ol className="wk-timeline" aria-label="Akış">
          {shown.map((e) => { const Icon = KIND_ICON[e.actor_kind]; const title = e.task_id && taskTitle?.(e.task_id); return (
            <li key={e.id} data-kind={e.actor_kind}>
              <span className="dot" aria-hidden />
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon size={13} aria-hidden /><strong>{e.actor}</strong></span> {e.text}
                {title && scope.project_id && <> · <Link href={`/app/projects/${scope.project_id}?task=${e.task_id}`} className="wk-x-link">{title}</Link></>}
                <small>{fmtTime(e.at)} · {KIND_LABEL[e.actor_kind]}</small>
              </div>
            </li>
          ); })}
        </ol>
      )}
    </div>
  );
}
