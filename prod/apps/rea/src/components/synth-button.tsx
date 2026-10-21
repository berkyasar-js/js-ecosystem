'use client';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-upload';

export function SynthButton({ projectId, has }: { projectId: string; has: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/projects/${projectId}/synthesize`, 'POST'); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : 'Sentez başarısız'); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-2">
      <div><button className="btn btn-primary" onClick={go} disabled={busy}><Sparkles size={15} aria-hidden />{busy ? 'Claude sentezliyor… (≈30–60 sn)' : has ? 'AI sentezi yenile' : 'AI sentez'}</button></div>
      {err && <p role="alert" className="err">{err}</p>}
    </div>
  );
}
