import type {
  AgentPrompt, AgentRun, Approval, ApprovalCreate, BoardAnswer, BoardDecision, Brand, Channel, ConnectData, Integration, Me, Member,
  Message, Organization, OrgSettings, Project, Task, TaskCreate, TaskState, TaskType, TeamMember, Twin, TwinBid,
} from '@jscore/contracts';

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
  // agents & intel
  listAgentPrompts(): Promise<AgentPrompt[]>;
  getActivePrompt(agent: string): Promise<AgentPrompt | null>;
  listAgentRuns(): Promise<AgentRun[]>;
  logAgentRun(run: Omit<AgentRun, 'id' | 'org_id' | 'created_at'>): Promise<void>;
  listBoardDecisions(): Promise<BoardDecision[]>;
  decideBoard(id: string, answer: BoardAnswer): Promise<BoardDecision>;
  listTwins(): Promise<Twin[]>;
  listTwinBids(): Promise<TwinBid[]>;
}

export class ForbiddenError extends Error {
  constructor(msg = 'Bu işlem için yetkin yok') { super(msg); this.name = 'ForbiddenError'; }
}
export class NotFoundError extends Error {
  constructor(what = 'Kayıt') { super(`${what} bulunamadı`); this.name = 'NotFoundError'; }
}
