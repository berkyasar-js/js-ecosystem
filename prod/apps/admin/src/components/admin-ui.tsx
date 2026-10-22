'use client';
import type { ReactNode } from 'react';
import { useSession } from './session';

/** Servis rolü gerektiren sayfalarda demo modu uyarısı. */
export function NeedsSupabase({ children }: { children: ReactNode }) {
  const { mode } = useSession();
  if (mode === 'demo') return <div className="card max-w-2xl text-sm" role="note"><strong>Demo modu</strong><p className="mt-1 text-muted">Bu bölüm Supabase bağlantısı ve servis rolü anahtarı ister (<code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>). Demo’da modüller, güvenlik, ajanlar, Kurul, otomasyonlar ve entegrasyonlar denenebilir.</p></div>;
  return <>{children}</>;
}
export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  return m ? <p role={m.ok ? 'status' : 'alert'} className={`mb-3 text-sm ${m.ok ? 'text-[#3ddc97]' : 'text-magenta'}`}>{m.text}</p> : null;
}
export const errText = (e: unknown) => (e instanceof Error ? e.message : 'İşlem başarısız');
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange(v: boolean): void; disabled?: boolean; label: string }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}
