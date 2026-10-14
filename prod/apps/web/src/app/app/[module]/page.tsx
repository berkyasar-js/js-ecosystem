'use client';
import { notFound, useParams } from 'next/navigation';
import { MODULES, canAccessModule } from '@jscore/contracts';
import { PageHeader } from '@/components/ui';
import { useSession } from '@/components/session';

/** Henüz üretim ekranı olmayan katalog modülleri için iskelet — 404 yok. */
export default function ModuleScaffold() {
  const { module: slug } = useParams<{ module: string }>();
  const { me } = useSession();
  const mod = MODULES.find((m) => m.slug === slug);
  if (!mod) notFound();
  const allowed = !me || canAccessModule(me.role, mod.id);
  return (
    <>
      <PageHeader title={mod.name} sub={mod.desc} />
      {allowed ? (
        <div className="card max-w-2xl">
          <span className="chip chip-warn">Yakında</span>
          <p className="mt-3 text-sm">Prototipte mevcut, üretimde sırada.</p>
          <p className="mt-2 text-sm text-muted">Bu modül aynı veri modeli (Supabase + RLS) üzerine inşa edilecek; şimdilik gezinme ve yetki kapsamı hazır.</p>
        </div>
      ) : <div className="card max-w-2xl text-sm text-muted">Bu modüle erişim yetkin yok.</div>}
    </>
  );
}
