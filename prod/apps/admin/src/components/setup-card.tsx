'use client';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Settings2 } from 'lucide-react';
import { DEFAULT_SETUP, SETUP_STEPS, SETUP_STEP_LABELS, nextSetupStep, setupProgress, setupStateSchema, type OrgSettings } from '@jscore/contracts';
import { APP_URL } from './admin-shell';

/** Kurulum ilerleme kartı (Genel bakış + Kurulum sayfası). Tamamlanınca Genel bakışta gizlenir. */
export function SetupCard({ settings, compact = false }: { settings: OrgSettings | null; compact?: boolean }) {
  const setup = setupStateSchema.safeParse(settings?.setup ?? DEFAULT_SETUP);
  const s = setup.success ? setup.data : DEFAULT_SETUP;
  const prog = setupProgress(s);
  if (compact && prog.complete) return null;
  const next = nextSetupStep(s);
  return (
    <section className="card" aria-label="Kurulum">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="signal-icon"><Settings2 size={17} aria-hidden /></span>
          <div><h2 className="font-bold">Çalışma alanı kurulumu {prog.complete ? <span className="chip chip-ok ml-1"><CheckCircle2 size={12} aria-hidden /> Tamamlandı</span> : `%${prog.pct}`}</h2>
            <p className="text-sm text-muted">{prog.done}/{prog.total} adım · sıradaki: {SETUP_STEP_LABELS[next]}</p>
            {compact && !prog.complete && <p className="mt-1 text-xs text-muted">Eksik: {SETUP_STEPS.filter((x) => x !== 'summary' && !s.done.includes(x)).map((x) => SETUP_STEP_LABELS[x]).join(', ')}</p>}</div></div>
        <div className="flex gap-2">
          {!compact && <Link className="btn" href="/admin/setup">Ayrıntı</Link>}
          {APP_URL ? <a className="btn btn-primary" href={`${APP_URL}/app/setup?step=${next}`} target="_blank" rel="noreferrer">Devam et <ArrowRight size={15} aria-hidden /></a> : <span className="text-xs text-muted">NEXT_PUBLIC_APP_URL tanımlı değil</span>}
        </div>
      </div>
      {!compact && (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SETUP_STEPS.map((step, i) => { const done = s.done.includes(step); return (
            <li key={step} className="nested flex items-center gap-3 text-sm"><span className={`setup-dot ${done ? 'done' : ''}`}>{done ? '✓' : i + 1}</span><span className="flex-1">{SETUP_STEP_LABELS[step]}</span>
              {APP_URL && <a className="text-xs underline" href={`${APP_URL}/app/setup?step=${step}`} target="_blank" rel="noreferrer">{done ? 'Düzenle' : 'Devam et'}</a>}</li>
          ); })}
        </ol>
      )}
    </section>
  );
}
