'use client';
import { Pin, PinOff } from 'lucide-react';
import type { ChartDef } from '@jscore/contracts';
import { Empty } from './ui';

const TONE: Record<string, string> = { ok: '#3ddc97', warn: '#ffb020', bad: 'var(--magenta)' };

/** Hafif yatay çubuk grafik (SVG yok, CSS); 6 yerleşik pano grafiği için ortak çizim. Ana Sayfa'ya sabitlenebilir. */
export function DashChart({ chart, pinned, onPin, compact = false }: { chart: ChartDef; pinned?: boolean; onPin?: () => void; compact?: boolean }) {
  const max = Math.max(1, ...chart.bars.map((b) => b.value));
  const bars = compact ? chart.bars.slice(0, 6) : chart.bars;
  return (
    <section className="card" aria-label={chart.title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{chart.title}</h2>
        {onPin && <button type="button" className="btn btn-ghost btn-sm" aria-pressed={pinned} onClick={onPin} title={pinned ? 'Ana sayfadan kaldır' : 'Ana sayfaya sabitle'}>{pinned ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}<span className="hidden sm:inline">{pinned ? 'Sabit' : 'Ana sayfaya sabitle'}</span></button>}
      </div>
      {bars.length === 0 || bars.every((b) => b.value === 0) ? <Empty>{chart.empty ?? 'Veri yok.'}</Empty> : (
        <ul className="grid gap-2" role="list">
          {bars.map((b) => (
            <li key={b.label} className="grid grid-cols-[minmax(72px,30%)_1fr_auto] items-center gap-3 text-sm" title={b.hint}>
              <span className="truncate text-muted">{b.label}</span>
              <div className="h-2.5 rounded-full bg-nested" role="img" aria-label={`${b.label}: ${b.value}${chart.unit ?? ''}`}>
                <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, (b.value / max) * 100)}%`, background: b.tone ? TONE[b.tone] : 'var(--accent)' }} />
              </div>
              <span className="w-14 text-right font-semibold tabular-nums">{chart.unit === '₺' ? `₺${b.value.toLocaleString('tr-TR')}` : `${b.value}${chart.unit && chart.unit !== '₺' ? chart.unit : ''}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
