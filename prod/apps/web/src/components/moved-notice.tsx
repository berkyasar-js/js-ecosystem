import Link from 'next/link';

export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL ?? '').replace(/\/$/, '');

/** Yönetim alanları Ana Yönetim Paneli'ne (apps/admin) taşındı; eski rotalar bu bildirimi gösterir. */
export function MovedNotice({ name, path }: { name: string; path: string }) {
  return (
    <div className="card max-w-2xl" role="note">
      <span className="chip chip-brand">Taşındı</span>
      <h1 className="mt-3 text-lg font-bold">{name}</h1>
      <p className="mt-2 text-sm">Bu alan Ana Yönetim Paneli’ne taşındı.</p>
      {ADMIN_URL
        ? <a className="btn btn-primary mt-4 inline-flex" href={`${ADMIN_URL}/admin/${path}`}>Ana Yönetim Paneli’ni aç →</a>
        : <p className="mt-2 text-sm text-muted">Panel adresi tanımlı değil (<code>NEXT_PUBLIC_ADMIN_URL</code>). Yöneticinize başvurun.</p>}
      <p className="mt-4 text-xs text-muted">Panele yalnızca owner ve org admin rolleri girebilir. <Link className="underline" href="/app/overview">Genel bakışa dön</Link></p>
    </div>
  );
}
