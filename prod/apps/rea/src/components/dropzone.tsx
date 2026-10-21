'use client';
import { FileUp } from 'lucide-react';
import { useId, useState } from 'react';

export function Dropzone({ accept, file, onFile, maxMb, hint, disabled }: { accept: string; file: File | null; onFile(f: File | null): void; maxMb: number; hint: string; disabled?: boolean }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = (f: File | undefined) => {
    setErr(null);
    if (!f) return;
    const ok = accept.split(',').some((a) => f.name.toLowerCase().endsWith(a.trim()));
    if (!ok) { setErr(`Yalnızca ${accept} dosyaları.`); return; }
    if (f.size > maxMb * 1048576) { setErr(`Dosya ${maxMb} MB sınırını aşıyor (${(f.size / 1048576).toFixed(1)} MB).`); return; }
    onFile(f);
  };
  return (
    <div>
      <label htmlFor={id} className={`dropzone ${over ? 'over' : ''}`} style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <FileUp size={22} aria-hidden />
        {file ? <strong>{file.name} <span className="muted">({(file.size / 1048576).toFixed(1)} MB)</span></strong> : <strong>Dosyayı sürükle ya da seç</strong>}
        <span className="hint">{hint}</span>
        <input id={id} type="file" accept={accept} disabled={disabled} onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {err && <p role="alert" className="err mt-2">{err}</p>}
    </div>
  );
}
