'use client';
import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client-upload';

export function DeleteProject({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const del = async () => {
    if (!confirm(`"${name}" projesi, çalışmaları ve bulguları silinsin mi? Bu geri alınamaz.`)) return;
    setBusy(true); setErr(null);
    try { await api(`/api/projects/${id}`, 'DELETE'); router.push('/projeler'); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : 'Silinemedi'); setBusy(false); }
  };
  return (<><button className="btn btn-sm btn-ghost" onClick={del} disabled={busy}><Trash2 size={14} aria-hidden />Sil</button>{err && <span role="alert" className="err">{err}</span>}</>);
}

export function EditQuestion({ id, question, seeds }: { id: string; question: string; seeds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(question);
  const [s, setS] = useState(seeds.join(', '));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api(`/api/projects/${id}`, 'PATCH', { question: q.trim(), seeds: s.split(/[,\n]/).map((x) => x.trim()).filter((x) => x.length >= 2).slice(0, 12) }); setOpen(false); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : 'Kaydedilemedi'); } finally { setBusy(false); }
  };
  if (!open) return <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}><Pencil size={14} aria-hidden />Soruyu düzenle</button>;
  return (
    <div className="card grid gap-3" style={{ width: '100%' }}>
      <div className="field"><label className="label" htmlFor="eq">Özellik sorusu</label><textarea id="eq" className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={2000} /></div>
      <div className="field"><label className="label" htmlFor="es">Aranacak adlar (virgülle)</label><input id="es" className="input" value={s} onChange={(e) => setS(e.target.value)} /></div>
      <p className="hint">Soru ve terimler yeni analiz çalışmasında kullanılır; mevcut kanıt listesini değiştirmek için analizi yeniden çalıştır.</p>
      {err && <p role="alert" className="err">{err}</p>}
      <div className="row"><button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Kaydet</button><button className="btn btn-sm" onClick={() => setOpen(false)}>Vazgeç</button></div>
    </div>
  );
}
