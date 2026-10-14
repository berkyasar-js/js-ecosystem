/** Bağımlılıksız SVG grafikleri — renkler CSS değişkenlerinden (koyu/açık tema uyumlu). */
const PAL = ['var(--brand-ink)', 'var(--accent)', '#3ddc97', '#ffb020', 'var(--color-cyan, #00f0ff)', '#ff3366'];

export function BarChart({ data, height = 160, fmt = (n: number) => String(n), label = 'Çubuk grafik' }: { data: Array<[string, number]>; height?: number; fmt?: (n: number) => string; label?: string }) {
  const max = Math.max(1, ...data.map(([, v]) => v)); const w = 560; const bw = w / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${w} ${height + 34}`} role="img" aria-label={label} className="w-full">
      <title>{label}</title>
      {data.map(([l, v], i) => {
        const h = Math.round((v / max) * height);
        return (
          <g key={l + i}>
            <rect x={i * bw + bw * 0.18} y={height - h + 14} width={bw * 0.64} height={h} rx={6} fill={PAL[i % PAL.length]}><title>{`${l}: ${fmt(v)}`}</title></rect>
            <text x={i * bw + bw / 2} y={height + 28} textAnchor="middle" fontSize="11" fill="var(--muted)">{l.length > 10 ? `${l.slice(0, 9)}…` : l}</text>
            <text x={i * bw + bw / 2} y={height - h + 9} textAnchor="middle" fontSize="10.5" fill="var(--ink)">{fmt(v)}</text>
          </g>
        );
      })}
    </svg>
  );
}
export function LineChart({ series, labels, height = 150, label = 'Çizgi grafik' }: { series: Array<{ name: string; values: number[] }>; labels: string[]; height?: number; label?: string }) {
  const w = 560; const all = series.flatMap((s) => s.values); const max = Math.max(1, ...all); const min = Math.min(0, ...all); const step = w / Math.max(1, labels.length - 1);
  const y = (v: number) => 12 + (1 - (v - min) / (max - min || 1)) * height;
  return (
    <svg viewBox={`0 0 ${w} ${height + 36}`} role="img" aria-label={label} className="w-full">
      <title>{label}</title>
      {series.map((s, si) => (
        <g key={s.name}>
          <polyline fill="none" stroke={PAL[si % PAL.length]} strokeWidth="2.5" points={s.values.map((v, i) => `${i * step},${y(v)}`).join(' ')} />
          {s.values.map((v, i) => <circle key={i} cx={i * step} cy={y(v)} r={3.5} fill={PAL[si % PAL.length]}><title>{`${s.name} · ${labels[i]}: ${v}`}</title></circle>)}
        </g>
      ))}
      {labels.map((l, i) => <text key={l} x={i * step} y={height + 30} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--muted)">{l}</text>)}
    </svg>
  );
}
export function Funnel({ steps }: { steps: Array<[string, number]> }) {
  const max = Math.max(1, steps[0]?.[1] ?? 1);
  return (
    <ol className="grid gap-2" aria-label="Huni">
      {steps.map(([l, v], i) => (
        <li key={l} className="grid grid-cols-[110px_1fr_60px] items-center gap-3 text-sm">
          <span className="text-muted">{l}</span>
          <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="h-5 w-full" role="img" aria-label={`${l}: ${v}`}><rect width="100" height="14" rx="4" fill="var(--nested)" /><rect width={(v / max) * 100} height="14" rx="4" fill={PAL[i % PAL.length]} /></svg>
          <span className="text-right font-semibold">{v}</span>
        </li>
      ))}
    </ol>
  );
}
export function Donut({ parts, size = 120, label = 'Dağılım' }: { parts: Array<[string, number]>; size?: number; label?: string }) {
  const total = parts.reduce((s, [, v]) => s + v, 0) || 1; const r = 42; const c = 2 * Math.PI * r; let off = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--nested)" strokeWidth="14" />
        {parts.map(([l, v], i) => { const len = (v / total) * c; const el = <circle key={l} cx="50" cy="50" r={r} fill="none" stroke={PAL[i % PAL.length]} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 50 50)"><title>{`${l}: ${v}`}</title></circle>; off += len; return el; })}
      </svg>
      <ul className="grid gap-1 text-xs">{parts.map(([l, v], i) => <li key={l} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PAL[i % PAL.length] }} />{l} <strong>{v}</strong></li>)}</ul>
    </div>
  );
}
export function Spark({ values, w = 90, h = 26 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(1, ...values); const min = Math.min(...values); const step = w / Math.max(1, values.length - 1);
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Eğilim"><polyline fill="none" stroke="var(--brand-ink)" strokeWidth="2" points={values.map((v, i) => `${i * step},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(' ')} /></svg>;
}
