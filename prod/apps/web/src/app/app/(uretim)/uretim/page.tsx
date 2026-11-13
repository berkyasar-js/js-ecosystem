'use client';
import Link from 'next/link';
import { MODULES, NAV_GROUPS, moduleEntitled } from '@jscore/contracts';
import { ICONS } from '@/components/icons';
import { Async, PageHeader, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { moduleVisible } from '@/lib/nav';

const GROUP = NAV_GROUPS.find((g) => g.id === 'production')!;
const COUNTS: Record<string, { coll: 'studio_items' | 'social_posts' | 'media_assets' | 'review_comments' | 'share_links' | 'decks' | 'campaigns' | 'event_items'; label: string }> = {
  studio: { coll: 'studio_items', label: 'kayıt' }, social: { coll: 'social_posts', label: 'içerik' }, media: { coll: 'media_assets', label: 'varlık' }, review: { coll: 'review_comments', label: 'yorum' },
  transfer: { coll: 'share_links', label: 'paylaşım' }, present: { coll: 'decks', label: 'sunum' }, marketing: { coll: 'campaigns', label: 'kampanya' }, events: { coll: 'event_items', label: 'etkinlik' },
};

/** Üretim: tüm yaratıcı araçlar tek çatıda; kartlar sayım gösterir, sekmeler eski modül sayfalarına gider. */
export default function Production() {
  const { me, features } = useSession();
  const q = useData(async (r) => {
    const out: Record<string, number> = {};
    await Promise.all(Object.entries(COUNTS).map(async ([id, c]) => { out[id] = await r.list(c.coll).then((x) => x.length).catch(() => 0); }));
    return out;
  });
  const vis = me ? moduleVisible(me.role, features.flags) : () => false;
  return (
    <>
      <PageHeader title="Üretim" sub="Brief’ten teslime: stüdyo, sosyal, medya, inceleme, transfer, sunum, pazarlama ve etkinlik" />
      <Async q={q}>{(counts) => (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {GROUP.modules.map((id) => {
            const m = MODULES.find((x) => x.id === id)!; const Icon = ICONS[m.icon] ?? ICONS.apps; const on = vis(id); const off = !moduleEntitled(id, features.flags);
            const body = <><div className="flex items-center justify-between"><Icon size={20} aria-hidden /><span className="chip">{off ? 'Kapalı' : `${counts[id] ?? 0} ${COUNTS[id].label}`}</span></div><h2 className="mt-3 font-bold">{m.name.replace('JS ', '')}</h2><p className="mt-1 text-sm text-muted">{m.desc}</p></>;
            return on ? <Link key={id} href={`/app/${m.slug}`} className="app-card">{body}</Link> : <div key={id} className="app-card is-off" aria-disabled="true">{body}<p className="text-xs text-muted">{off ? 'Panelden açılabilir' : 'Rolüne kapalı'}</p></div>;
          })}
        </div>
      )}</Async>
    </>
  );
}
