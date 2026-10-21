/** REA stderr'ine yazdığı `{"rea_progress":{...}}` satırlarını Türkçe, kullanıcıya gösterilebilir ilerlemeye çevirir. */
export interface ReaProgress { phase: string; message: string; completed: number; total: number; sequence: number }

export function parseProgressLine(line: string): ReaProgress | null {
  const t = line.trim();
  if (!t.startsWith('{')) return null;
  try {
    const o = JSON.parse(t) as { rea_progress?: Partial<ReaProgress> };
    const p = o.rea_progress;
    if (!p || typeof p.phase !== 'string') return null;
    return { phase: p.phase, message: String(p.message ?? ''), completed: Number(p.completed ?? 0), total: Number(p.total ?? 0), sequence: Number(p.sequence ?? 0) };
  } catch { return null; }
}

const PHASES: Record<string, string> = {
  analyze_javascript_application: 'Paket envanteri çıkarılıyor',
  read_javascript_artifacts: 'Kaynak dosyalar okunuyor',
  parse_javascript_sources: 'Dosyalar işlenmeye hazırlanıyor',
  build_javascript_application_graph: 'Uygulama grafiği kuruluyor (Electron sınırları, IPC)',
  seal_javascript_application_graph: 'Uygulama grafiği doğrulanıyor',
  build_javascript_semantic_graph: 'Anlamsal ilişkiler bağlanıyor',
  seal_javascript_semantic_graph: 'Anlamsal grafik doğrulanıyor',
};

/** "(12/167)" biçimindeki dosya sayacını yakalar. */
export function fileFraction(message: string): { done: number; total: number } | null {
  const m = message.match(/\((\d+)\/(\d+)\)\s*$/);
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
}

export function describeProgress(p: ReaProgress): { text: string; fraction: number | null } {
  const frac = fileFraction(p.message);
  if (p.phase === 'parse_javascript_source' || p.phase === 'process_javascript_artifact_metadata') {
    const name = p.message.replace(/^(Parsing and projecting|Processing metadata for)\s+/, '').replace(/\s*\(\d+\/\d+\)\s*$/, '');
    return { text: `Çözümleniyor: ${name}${frac ? ` (${frac.done}/${frac.total})` : ''}`, fraction: frac ? frac.done / Math.max(1, frac.total) : null };
  }
  return { text: PHASES[p.phase] ?? (p.message || p.phase), fraction: frac ? frac.done / Math.max(1, frac.total) : null };
}

/** Aşama içindeki kesri genel yüzdeye çevirir. */
export function overallPercent(stage: 'hazirlik' | 'indirme' | 'analiz' | 'ozet' | 'kayit', fraction = 0): number {
  const r = { hazirlik: [2, 10], indirme: [10, 30], analiz: [30, 80], ozet: [80, 90], kayit: [90, 99] }[stage];
  return Math.round(r[0] + (r[1] - r[0]) * Math.min(1, Math.max(0, fraction)));
}
