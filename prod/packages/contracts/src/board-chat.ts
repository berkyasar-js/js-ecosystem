import { z } from 'zod';

/* ───────── Kurul Sohbeti (apps/admin → Yönetim Kurulu → Kurul Sohbeti) ───────── */

/** Dosya başı ve mesaj başı satır içi metin sınırları (bayt). */
export const BOARD_ATTACHMENT_MAX_BYTES = 200 * 1024;
export const BOARD_MESSAGE_MAX_BYTES = 600 * 1024;
export const BOARD_ATTACHMENT_EXTS = ['.md', '.txt', '.markdown'] as const;
/** Modele geçirilen son mesaj sayısı; daha eskileri thread.summary'ye sıkıştırılır. */
export const BOARD_HISTORY_WINDOW = 30;

export const boardAssignmentSchema = z.object({
  employee_id: z.string().nullish(),
  employee_code: z.string().nullish(),
  employee_name: z.string().min(1),
  role_title: z.string().default(''),
  responsibility: z.string().default(''),
  workload_pct: z.number().min(0).max(100).nullish(),
});
export const boardPlanTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().default(''),
  assignee_name: z.string().nullish(),
  priority: z.enum(['low', 'normal', 'high']).catch('normal'),
  estimate_minutes: z.number().int().min(0).max(100000).catch(120),
  due_in_days: z.number().int().min(0).max(3650).nullish(),
  depends_on: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
  phase: z.string().nullish(),
});
export const boardMilestoneSchema = z.object({ name: z.string().min(1), due_in_days: z.number().int().min(0).max(3650).catch(14), tasks: z.array(z.string()).default([]) });
export const boardRiskSchema = z.object({ risk: z.string().min(1), mitigation: z.string().default(''), owner: z.string().nullish() });

/** CHAIR'in yapılandırılmış çıktısı: görev dağılımı + yapılacaklar listesi (+ kilometre taşları, riskler, açık sorular). */
export const boardPlanSchema = z.object({
  summary: z.string().default(''),
  assumptions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  assignments: z.array(boardAssignmentSchema).default([]),
  tasks: z.array(boardPlanTaskSchema).default([]),
  milestones: z.array(boardMilestoneSchema).nullish(),
  risks: z.array(boardRiskSchema).nullish(),
});
export type BoardPlan = z.infer<typeof boardPlanSchema>;
export type BoardPlanTask = z.infer<typeof boardPlanTaskSchema>;
export type BoardAssignment = z.infer<typeof boardAssignmentSchema>;

/** Model yanıtı: {reply: markdown, plan: BoardPlan|null}. */
export const boardChatModelOutputSchema = z.object({ reply: z.string().default(''), plan: boardPlanSchema.nullish() });
export type BoardChatModelOutput = z.infer<typeof boardChatModelOutputSchema>;

export const boardAttachmentSchema = z.object({ name: z.string().trim().min(1).max(200), text: z.string().max(BOARD_ATTACHMENT_MAX_BYTES * 2), bytes: z.number().int().min(0).optional() });
export type BoardAttachment = { name: string; bytes: number; text: string };

export const boardThreadCreateSchema = z.object({ title: z.string().trim().min(1).max(200).default('Yeni konu') });
export const boardThreadPatchSchema = z.object({ title: z.string().trim().min(1).max(200).optional(), status: z.enum(['open', 'archived']).optional() });
export const boardMessageCreateSchema = z.object({
  content: z.string().max(BOARD_MESSAGE_MAX_BYTES).default(''),
  attachments: z.array(boardAttachmentSchema).max(10).default([]),
}).refine((v) => v.content.trim().length > 0 || v.attachments.length > 0, { message: 'Mesaj ya da dosya gerekli' });
export const boardApplySchema = z.object({
  message_id: z.string().min(1),
  project_id: z.string().min(1).optional(),
  new_project: z.object({ name: z.string().trim().min(2).max(200), brand_id: z.string().min(1).optional(), client_id: z.string().min(1).optional() }).optional(),
  task_indexes: z.array(z.number().int().min(0)).optional(),
}).refine((v) => !!v.project_id || !!v.new_project, { message: 'Proje seçilmeli ya da yeni proje adı verilmeli' });

export interface BoardThread { id: string; org_id: string; title: string; created_by: string | null; status: 'open' | 'archived'; summary: string | null; created_at: string; updated_at: string }
export interface BoardMessage {
  id: string; org_id: string; thread_id: string; role: 'user' | 'assistant' | 'system'; content: string;
  attachments: BoardAttachment[]; plan: BoardPlan | null; tokens_in: number; tokens_out: number; cost_usd: number; created_at: string;
  /** Yalnızca yanıt gövdesinde (DB'de yok): demo modunda üretildi. */
  demo?: boolean;
}
export interface BoardApplyResult { created: number; project_id: string; project_name: string; unmatched_assignees: string[]; task_ids: string[]; demo?: boolean }
