import { z } from 'zod';

export type TargetKind = 'web' | 'bundle' | 'local';
export type ProjectStatus = 'draft' | 'queued' | 'running' | 'done' | 'failed';
export type RunStatus = 'queued' | 'running' | 'done' | 'failed';

export const TARGET_LABELS: Record<TargetKind, string> = {
  web: 'Web sitesi (URL)',
  bundle: 'Electron / JS paketi',
  local: 'Bilgisayarımda',
};
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Taslak',
  queued: 'Sırada',
  running: 'Çalışıyor',
  done: 'Tamamlandı',
  failed: 'Hata',
};

export interface Project {
  id: string;
  org_id: string;
  name: string;
  target_kind: TargetKind;
  target_url: string | null;
  upload_path: string | null;
  upload_name: string | null;
  upload_bytes: number | null;
  question: string;
  seeds: string[];
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

/** REA çıktısından süzülen tek kanıt kaydı (dosya, satır, kısa snippet). */
export interface DigestItem {
  kind: string; // ipc-channel | ipc-handler | endpoint | child-process | function | keyword | ...
  label: string;
  file: string | null;
  line: number | null;
  snippet: string | null;
  note?: string | null;
}
export interface HelperCandidate { path: string; why: string }
export interface Digest {
  items: DigestItem[];
  helpers: HelperCandidate[];
  stats: Record<string, number | string>;
  /** REA'nın kendi `limitations` / `unknowns` metinleri (özgün, İngilizce). */
  limitations: string[];
  unknowns: string[];
  keywords: string[];
  source: 'rea' | 'sample';
}

export interface RunSummary {
  stats: Record<string, number | string | null>;
  coverage?: Record<string, unknown> | null;
  limitation_count?: number;
  [k: string]: unknown;
}

export interface Run {
  id: string;
  project_id: string;
  org_id: string;
  status: RunStatus;
  stage: string | null;
  progress: number;
  message: string | null;
  log: string[];
  error: string | null;
  summary: RunSummary | null;
  digest: Digest | null;
  evidence_bytes: number | null;
  evidence_truncated: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

// ---- AI sentez şeması ---- (uzun alanlar reddedilmez, kırpılır)
const str = (n: number) => z.string().transform((v) => (v.length > n ? v.slice(0, n - 1) + '…' : v));
const strN = (n: number) => str(n).nullable().default(null);
export const evidenceSchema = z.object({
  file: strN(400),
  symbol: strN(200), // fonksiyon ya da mesaj adı
  snippet: strN(600),
});
export const flowSchema = z.object({
  summary: str(1200),
  steps: z.array(z.object({
    title: str(160),
    description: str(900),
    confidence: z.enum(['yüksek', 'orta', 'düşük']),
    evidence: z.array(evidenceSchema).default([]).transform((a) => a.slice(0, 4)),
  })).transform((a) => a.slice(0, 14)),
  blind_spots: z.array(z.object({ title: str(160), detail: str(700) })).default([]).transform((a) => a.slice(0, 10)),
  helper_programs: z.array(z.object({ name: str(160), path: strN(400), role: str(500), evidence: strN(400) })).default([]).transform((a) => a.slice(0, 8)),
  has_helper: z.boolean().default(false),
  next_questions: z.array(str(300)).default([]).transform((a) => a.slice(0, 6)),
});
export type Flow = z.infer<typeof flowSchema>;

export interface Finding {
  id: string;
  project_id: string;
  run_id: string | null;
  org_id: string;
  kind: 'synthesis' | 'note';
  title: string;
  body: Flow;
  model: string | null;
  created_at: string;
}

export interface Actor {
  mode: 'demo' | 'supabase';
  userId: string | null;
  email: string | null;
  orgId: string;
  role: string;
}
