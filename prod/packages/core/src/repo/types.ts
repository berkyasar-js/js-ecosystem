import type {
  AuditEvent, Checklist, CollKey, DealStage, Deal, Leave, Records, SaveInput,
  AgentPrompt, AgentRun, Approval, ApprovalCreate, BoardAnswer, BoardDecision, Brand, Channel, ConnectData, Integration, Me, Member,
  Message, Organization, OrgSettings, Project, Task, TaskCreate, TaskPatch, TaskState, TaskType, TeamMember, Twin, TwinBid,
  AccessToken, BidAssignResult, BidProposal, TaskAssignment, TaskBid, TokenCreate,
  TrelloImportResult, TrelloMode, TrelloPublicState,
  AttachmentInput, CheckItemCreate, CheckItemPatch, TaskAttachment, TaskBadges, TaskCheckItem, TaskChecklist, TaskComment,
} from '@jscore/contracts';
import type { TrelloSnapshot } from '../integrations/trello-map';

export interface Repo {
  readonly mode: 'demo' | 'supabase';
  // orgs & me
  listOrgs(): Promise<Organization[]>;
  me(): Promise<Me | null>;
  team(): Promise<TeamMember[]>;
  listMembers(): Promise<Member[]>;
  // work
  listBrands(): Promise<Brand[]>;
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  listTaskTypes(): Promise<TaskType[]>;
  listTasks(filter?: { project_id?: string }): Promise<Task[]>;
  createTask(input: TaskCreate): Promise<Task>;
  moveTask(id: string, state: TaskState): Promise<Task>;
  /** Görev alanlarını (başlık, sorumlu, öncelik, bitiş) günceller; aşama değişimi için moveTask kullanılır. */
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  // görev ayrıntıları (0012): yorum, checklist, ek. Yazma başarısı sunucu onayıyla döner; hata fırlatır.
  listComments(taskId: string): Promise<TaskComment[]>;
  addComment(taskId: string, body: string): Promise<TaskComment>;
  updateComment(id: string, body: string): Promise<TaskComment>;
  deleteComment(id: string): Promise<void>;
  listChecklists(taskId: string): Promise<TaskChecklist[]>;
  addChecklist(taskId: string, name: string): Promise<TaskChecklist>;
  updateChecklist(id: string, patch: { name: string }): Promise<TaskChecklist>;
  deleteChecklist(id: string): Promise<void>;
  addCheckItem(checklistId: string, input: CheckItemCreate): Promise<TaskCheckItem>;
  updateCheckItem(id: string, patch: CheckItemPatch): Promise<TaskCheckItem>;
  deleteCheckItem(id: string): Promise<void>;
  listAttachments(taskId: string): Promise<TaskAttachment[]>;
  /** Dosya (≤25 MB; Supabase: Storage `task-files`, demo: nesne adresi) ya da bağlantı ekler. */
  addAttachment(taskId: string, input: AttachmentInput): Promise<TaskAttachment>;
  updateAttachment(id: string, patch: { name: string }): Promise<TaskAttachment>;
  deleteAttachment(id: string): Promise<void>;
  /** Açılır / indirilir adres: Storage dosyasında imzalı (1 sa), bağlantıda url. */
  attachmentUrl(a: TaskAttachment, opts?: { download?: boolean }): Promise<string>;
  /** TaskRow / pano rozetleri için sayımlar (yorum, ek, checklist 4/12). */
  taskBadges(taskIds: string[]): Promise<Record<string, TaskBadges>>;
  // approvals
  listApprovals(): Promise<Approval[]>;
  createApproval(input: ApprovalCreate): Promise<Approval>;
  decideApproval(id: string, decision: 'approved' | 'rejected', note?: string): Promise<Approval>;
  // comms
  listInbox(): Promise<Message[]>;
  listChannels(): Promise<Channel[]>;
  listMessages(channelId: string): Promise<Message[]>;
  sendMessage(channelId: string, body: string): Promise<Message>;
  subscribeMessages(channelId: string, cb: (m: Message) => void): () => void;
  // settings & connect
  getSettings(): Promise<OrgSettings>;
  saveSettings(patch: Partial<OrgSettings>): Promise<OrgSettings>;
  getConnect(): Promise<ConnectData>;
  setIntegrationStatus(id: string, status: Integration['status']): Promise<void>;
  /** API anahtarı: yalnızca sha256 özeti saklanır; düz token yalnızca bu çağrının dönüşünde bir kez bulunur. owner/org_admin/integration_admin. */
  createToken(input: TokenCreate): Promise<{ token: AccessToken; plaintext: string }>;
  revokeToken(id: string): Promise<void>;
  /** Trello (yalnızca DemoRepo): Supabase'de sunucu rotaları /api/integrations/trello/* kullanılır (sırlar istemciye inmez). */
  trelloState?(): Promise<TrelloPublicState>;
  trelloImport?(fixture?: TrelloSnapshot): Promise<TrelloImportResult>;
  trelloSetMember?(name: string, employeeId: string): Promise<void>;
  trelloSetMode?(mode: TrelloMode): Promise<void>;
  // agents & intel
  listAgentPrompts(): Promise<AgentPrompt[]>;
  getActivePrompt(agent: string): Promise<AgentPrompt | null>;
  listAgentRuns(): Promise<AgentRun[]>;
  logAgentRun(run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'>): Promise<void>;
  /** Ay içi ajan harcaması (USD, agent_runs.cost_usd toplamı). month = 'YYYY-MM'. */
  monthlyAgentSpend(month: string): Promise<number>;
  listBoardDecisions(): Promise<BoardDecision[]>;
  decideBoard(id: string, answer: BoardAnswer): Promise<BoardDecision>;
  listTwins(): Promise<Twin[]>;
  listTwinBids(): Promise<TwinBid[]>;
  // ihale (twins.bids): görev için ikiz teklifleri
  listTaskBids(taskId?: string): Promise<TaskBid[]>;
  listTaskAssignments(taskId?: string): Promise<TaskAssignment[]>;
  /** Görevi ihaleye açar (önceki açık teklifler çekilir). Demo `proposed` yoksa kendi üretir; Supabase'de teklifler `twin_bid` ajanından (sunucu) gelir. */
  openTaskForBids(taskId: string, proposed?: BidProposal[]): Promise<TaskBid[]>;
  /** Tekliften atama. Görev önceliği 'high' ise onay kapısı: onay oluşur, karar 'approved' olunca atama yapılır. */
  assignFromBid(bidId: string): Promise<BidAssignResult>;
  // modül koleksiyonları (kayıt + RLS: bkz. contracts COLLECTIONS)
  list<K extends CollKey>(kind: K): Promise<Records[K][]>;
  /** id yoksa oluşturur, varsa birleştirerek günceller; zod doğrular, audit yazar. */
  save<K extends CollKey>(kind: K, input: SaveInput<K>): Promise<Records[K]>;
  remove(kind: CollKey, id: string): Promise<void>;
  audit(action: string, resource: string, meta?: Record<string, unknown>): Promise<void>;
  listAudit(): Promise<AuditEvent[]>;
  // alan kuralı olan işlemler
  moveDeal(id: string, stage: DealStage): Promise<Deal>;
  decideLeave(id: string, decision: 'approved' | 'rejected'): Promise<Leave>;
  /** Teklif (offer) → çalışan + onboarding checklist + ilk görev. */
  hireCandidate(candidateId: string): Promise<{ member: TeamMember; checklist: Checklist[] }>;
  approveSocialBatch(brandId: string): Promise<number>;
  /** Herkese açık başvuru (/apply/[job]). Demo: localStorage kuyruğu. */
  submitApplication(jobSlug: string, input: { name: string; email: string; portfolio?: string; note?: string }): Promise<void>;
  /** Demo kuyruğundaki başvuruları aday olarak içeri alır; Supabase'de 0 döner (doğrudan yazılır). */
  ingestApplications(): Promise<number>;
}

export class ForbiddenError extends Error {
  constructor(msg = 'Bu işlem için yetkin yok') { super(msg); this.name = 'ForbiddenError'; }
}
export class NotFoundError extends Error {
  constructor(what = 'Kayıt') { super(`${what} bulunamadı`); this.name = 'NotFoundError'; }
}
