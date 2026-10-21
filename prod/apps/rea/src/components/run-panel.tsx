'use client';
import { AlertTriangle, Play, RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '@/lib/client-upload';
import { MAX_UPLOAD_BYTES } from '@/lib/limits';
import type { Run, TargetKind } from '@/lib/types';
import { Dropzone } from './dropzone';

type LightRun = Omit<Run, 'digest'>;
const STAGES: Array<[string, string]> = [['hazirlik', 'Hazırlık'], ['indirme', 'Toplama'], ['analiz', 'REA analizi'], ['ozet', 'Özet'], ['kayit', 'Kayıt']];

export function RunPanel({ projectId, kind, initial, hasUpload, demo }: { projectId: string; kind: TargetKind; initial: LightRun | null; hasUpload: boolean; demo: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<LightRun | null>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polling = useRef<string | null>(null);
  const active = run?.status === 'queued' || run?.status === 'running';
  const needsFile = kind !== 'web' && !hasUpload;

  const poll = useCallback(async (id: string) => {
    polling.current = id;
    try {
      const { run: r } = await api<{ run: LightRun }>(`/api/runs/${id}`, 'GET');
      setRun(r);
      if (r.status === 'queued' || r.status === 'running') timer.current = setTimeout(() => void poll(id), 2000);
      else { polling.current = null; router.refresh(); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Durum alınamadı'); timer.current = setTimeout(() => void poll(id), 5000); }
  }, [router]);

  useEffect(() => {
    if (initial && (initial.status === 'queued' || initial.status === 'running') && polling.current !== initial.id) void poll(initial.id);
  }, [initial, poll]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const start = async () => {
    setErr(null);
    try {
      if (needsFile) {
        if (!file) { setErr('Önce dosyayı seç.'); return; }
        setBusy('Dosya yükleniyor…');
        const up = await uploadFile(kind === 'local' ? 'local' : 'bundle', file);
        await api(`/api/projects/${projectId}`, 'PATCH', { upload_path: up.path, upload_name: up.name, upload_bytes: up.bytes });
      }
      setBusy('Başlatılıyor…');
      const { run_id } = await api<{ run_id: string }>(`/api/projects/${projectId}/run`, 'POST');
      setRun({ id: run_id, project_id: projectId, org_id: '', status: 'queued', stage: 'hazirlik', progress: 0, message: 'Sıraya alındı', log: [], error: null, summary: null, evidence_bytes: null, evidence_truncated: false, started_at: null, finished_at: null, created_at: new Date().toISOString() });
      router.refresh();
      void poll(run_id);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Başlatılamadı'); } finally { setBusy(null); }
  };

  const idx = STAGES.findIndex(([s]) => s === run?.stage);
  return (
    <section className="card grid gap-4" aria-labelledby="run-h" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="run-h" className="h2" style={{ margin: 0 }}>Analiz çalıştırma</h2>
        {!active && (
          <button className="btn btn-primary" onClick={start} disabled={!!busy || (demo && kind !== 'web')}>
            {run ? <RotateCw size={15} aria-hidden /> : <Play size={15} aria-hidden />}{busy ?? (run ? 'Yeniden çalıştır' : needsFile ? 'Yükle ve çalıştır' : 'Çalıştır')}
          </button>
        )}
      </div>

      {needsFile && !active && (
        <div className="stack-y">
          <p className="sub">{kind === 'local' ? 'Bilgisayarında REA ile aldığın JSON çıktısını yükle.' : 'Analiz edilecek .asar ya da .zip dosyasını yükle.'}</p>
          <Dropzone accept={kind === 'local' ? '.json' : '.asar,.zip'} file={file} onFile={setFile} maxMb={Math.round(MAX_UPLOAD_BYTES / 1048576)} disabled={demo} hint={demo ? 'Demo modunda yükleme kapalı.' : `En çok ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB`} />
        </div>
      )}

      {run && (active || run.status === 'failed') && (
        <div className="grid gap-3">
          <div className="row" style={{ gap: 6 }}>
            {STAGES.map(([s, label], i) => <span key={s} className={`chip ${i < idx ? 'chip-ok' : i === idx ? (run.status === 'failed' ? 'chip-bad' : 'chip-brand') : ''}`}>{label}</span>)}
          </div>
          <div className={`progress ${run.status === 'failed' ? 'fail' : ''}`} role="progressbar" aria-valuenow={run.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Analiz ilerlemesi"><i style={{ width: `${run.progress}%` }} /></div>
          <div className="sub">{run.message ?? '…'} <span className="muted">· %{run.progress}</span></div>
          {run.log.length > 0 && <div className="log" tabIndex={0} aria-label="Çalışma günlüğü">{run.log.slice(-12).map((l, i) => <div key={i}>{l}</div>)}</div>}
        </div>
      )}
      {run?.status === 'failed' && (
        <div className="callout bad" role="alert"><AlertTriangle size={15} aria-hidden style={{ display: 'inline', marginRight: 6 }} /><b>Analiz başarısız.</b> {run.error}</div>
      )}
      {!run && !needsFile && <p className="sub">Henüz çalıştırılmadı.</p>}
      {err && <p role="alert" className="err">{err}</p>}
    </section>
  );
}
