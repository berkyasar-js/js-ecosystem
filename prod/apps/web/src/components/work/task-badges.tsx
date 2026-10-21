'use client';
import { AlignLeft, CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Task, TaskAttachment, TaskBadges } from '@jscore/contracts';
import { useSession } from '../session';
import { useAttachmentUrl } from './use-task-extras';

/** Trello benzeri küçük rozetler: açıklama · checklist 4/12 · yorum · ek. Hepsi sıfırsa hiçbir şey çizmez. */
export function TaskBadgeList({ task, badges }: { task: Task; badges?: TaskBadges }) {
  const desc = !!task.description?.trim();
  const b = badges;
  if (!desc && !(b && (b.comments || b.attachments || b.checkTotal))) return null;
  return (
    <span className="wk-x-badges">
      {desc && <span className="wk-x-badge" title="Açıklaması var"><AlignLeft size={13} aria-hidden /><span className="wk-sr">Açıklaması var</span></span>}
      {!!b?.checkTotal && <span className="wk-x-badge" data-done={b.checkDone === b.checkTotal} title={`Checklist ${b.checkDone}/${b.checkTotal}`}><CheckSquare size={13} aria-hidden />{b.checkDone}/{b.checkTotal}<span className="wk-sr"> checklist maddesi tamamlandı</span></span>}
      {!!b?.comments && <span className="wk-x-badge" title={`${b.comments} yorum`}><MessageSquare size={13} aria-hidden />{b.comments}<span className="wk-sr"> yorum</span></span>}
      {!!b?.attachments && <span className="wk-x-badge" title={`${b.attachments} dosya`}><Paperclip size={13} aria-hidden />{b.attachments}<span className="wk-sr"> dosya</span></span>}
    </span>
  );
}

/** Pano kartı kapağı: renk bandı ya da görsel ek (imzalı adres tembel çözülür). */
export function CardCover({ task }: { task: Task }) {
  const { repo } = useSession();
  const aid = task.cover?.attachment_id ?? null;
  const [att, setAtt] = useState<TaskAttachment | null>(null);
  useEffect(() => {
    let alive = true;
    setAtt(null);
    if (repo && aid) void repo.listAttachments(task.id).then((l) => { if (alive) setAtt(l.find((a) => a.id === aid) ?? null); }, () => undefined);
    return () => { alive = false; };
  }, [repo, aid, task.id]);
  const url = useAttachmentUrl(repo, att);
  // eslint-disable-next-line @next/next/no-img-element
  if (aid) return url ? <img className="wk-x-cardcover" src={url} alt="" loading="lazy" /> : null;
  return task.cover?.color ? <span className="wk-x-cardstripe" data-cover={task.cover.color} aria-hidden /> : null;
}
