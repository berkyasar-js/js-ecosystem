'use client';
import { useEffect, useState } from 'react';
import { useSession } from './session';

/** Çevrimiçi çalışanlar (0017): Supabase Realtime Presence (org kanalı) / demo: periyodik karışım. Kimlik = employees.id (yoksa auth user id). */
export function usePresence(): Set<string> {
  const { repo } = useSession();
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!repo) return;
    const off = repo.subscribePresence((ids) => setOnline(new Set(ids)));
    return off;
  }, [repo]);
  return online;
}
export function PresenceDot({ online, label = true }: { online: boolean; label?: boolean }) {
  return <span className="inline-flex items-center gap-1 text-xs" title={online ? 'Çevrimiçi' : 'Çevrimdışı'}><i aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: online ? '#3ddc97' : 'var(--line, #556)' }} />{label && <span className="text-muted">{online ? 'çevrimiçi' : 'çevrimdışı'}</span>}</span>;
}
