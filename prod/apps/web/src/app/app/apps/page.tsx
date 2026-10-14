'use client';
import Link from 'next/link';
import { MODULES, canAccessModule } from '@jscore/contracts';
import { ICONS } from '@/components/icons';
import { PageHeader } from '@/components/ui';
import { useSession } from '@/components/session';

export default function Apps() {
  const { me } = useSession();
  const mods = MODULES.filter((m) => m.id !== 'apps' && (!me || canAccessModule(me.role, m.id)));
  return (
    <>
      <PageHeader title="Uygulamalar" sub="Rolüne açık tüm modüller" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mods.map((m) => {
          const Icon = ICONS[m.icon] ?? ICONS.apps;
          return (
            <Link key={m.id} href={`/app/${m.slug}`} className="card transition hover:brightness-125">
              <div className="flex items-center justify-between"><Icon size={20} aria-hidden /><span className={`chip ${m.live ? 'chip-ok' : ''}`}>{m.live ? 'Canlı' : 'Sırada'}</span></div>
              <h2 className="mt-3 font-bold">{m.name}</h2>
              <p className="mt-1 text-sm text-muted">{m.desc}</p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
