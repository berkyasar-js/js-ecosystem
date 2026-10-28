/** Yükleme üst sınırı (Supabase Storage bucket sınırıyla aynı). Vercel fonksiyon gövdesi 4,5 MB olduğu için dosya doğrudan Storage'a gider. */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
/** Veritabanına yazılacak ham kanıt (evidence) üst sınırı. */
export const MAX_EVIDENCE_DB_BYTES = 5 * 1024 * 1024;
export const MAX_DIGEST_ITEMS = 300;
export const RUN_MAX_DURATION_S = 300;
/** REA tek JS dosyası için süre sınırı; fonksiyon süresinin altında kalmalı. */
export const REA_ANALYSIS_TIMEOUT_MS = 200_000;
export const REA_MAX_HEAP_MB = 2048;
export const SITE_LIMITS = { maxScripts: 40, maxTotalBytes: 14 * 1024 * 1024, maxFileBytes: 5 * 1024 * 1024, maxHtmlBytes: 3 * 1024 * 1024, timeoutMs: 15_000 } as const;
