import { createHash } from 'node:crypto';
import { jsonRpcRequestSchema, mcpCreateTaskDraftArgs, mcpProjectStatusArgs } from '@jscore/contracts';
import { DEMO_TODAY } from './agents/demo';
import type { Repo } from './repo/types';
import { isOverdue } from '@/components/work/work-utils';

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface McpBackend {
  projectStatus(projectId?: string): Promise<unknown>;
  createTaskDraft(a: { project_id: string; title: string; task_type?: string; priority?: 'low' | 'normal' | 'high'; due_at?: string }): Promise<unknown>;
}
type Rpc = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

export const MCP_TOOLS = [
  { name: 'project_status', description: 'Proje(ler)in akış aşaması, görev dağılımı ve geciken işleri.', inputSchema: { type: 'object', properties: { project_id: { type: 'string' } } } },
  { name: 'create_task_draft', description: 'Brief aşamasında bir görev taslağı oluşturur (onay akışına girer).', inputSchema: { type: 'object', required: ['project_id', 'title'], properties: { project_id: { type: 'string' }, title: { type: 'string' }, task_type: { type: 'string' }, priority: { type: 'string', enum: ['low', 'normal', 'high'] }, due_at: { type: 'string' } } } },
];

export class RepoMcpBackend implements McpBackend {
  constructor(private repo: Repo, private today = DEMO_TODAY) {}
  async projectStatus(projectId?: string) {
    const projects = (await this.repo.listProjects()).filter((p) => !projectId || p.id === projectId);
    const tasks = await this.repo.listTasks();
    return projects.map((p) => {
      const ts = tasks.filter((t) => t.project_id === p.id);
      return {
        id: p.id, name: p.name, status: p.status, flow_stage: p.flow_stage, due_at: p.due_at,
        tasks: ts.length, by_state: ts.reduce<Record<string, number>>((m, t) => ({ ...m, [t.state]: (m[t.state] ?? 0) + 1 }), {}),
        overdue: ts.filter((t) => t.state !== 'archive' && isOverdue(t, this.today)).length,
      };
    });
  }
  async createTaskDraft(a: Parameters<McpBackend['createTaskDraft']>[0]) {
    const t = await this.repo.createTask({
      project_id: a.project_id, title: a.title, task_type: a.task_type ?? 'general', priority: a.priority ?? 'normal',
      due_at: a.due_at ?? this.today, state: 'brief', source_ref: 'mcp',
    });
    return { id: t.id, title: t.title, state: t.state, persisted: this.repo.mode === 'supabase' };
  }
}

const err = (id: Rpc['id'], code: number, message: string): Rpc => ({ jsonrpc: '2.0', id, error: { code, message } });

/** Minimal MCP (JSON-RPC 2.0): initialize, ping, tools/list, tools/call. Bildirimler (id yok) için null döner. */
export async function handleMcp(body: unknown, backend: McpBackend): Promise<Rpc | null> {
  const parsed = jsonRpcRequestSchema.safeParse(body);
  if (!parsed.success) return err(null, -32600, 'Geçersiz istek');
  const { id = null, method, params } = parsed.data;
  const isNotification = parsed.data.id === undefined;
  try {
    let result: unknown;
    switch (method) {
      case 'initialize': result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'jscore-mcp', version: '0.1.0' } }; break;
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: MCP_TOOLS }; break;
      case 'tools/call': {
        const name = params?.name;
        const argsIn = (params?.arguments ?? {}) as unknown;
        if (name === 'project_status') {
          const a = mcpProjectStatusArgs.safeParse(argsIn);
          if (!a.success) return err(id, -32602, 'Geçersiz argüman');
          result = { content: [{ type: 'text', text: JSON.stringify(await backend.projectStatus(a.data.project_id)) }] };
        } else if (name === 'create_task_draft') {
          const a = mcpCreateTaskDraftArgs.safeParse(argsIn);
          if (!a.success) return err(id, -32602, 'Geçersiz argüman: ' + a.error.issues.map((i) => i.path.join('.')).join(','));
          result = { content: [{ type: 'text', text: JSON.stringify(await backend.createTaskDraft(a.data)) }] };
        } else return err(id, -32601, `Bilinmeyen araç: ${String(name)}`);
        break;
      }
      default:
        if (isNotification) return null;
        return err(id, -32601, `Bilinmeyen yöntem: ${method}`);
    }
    return isNotification ? null : { jsonrpc: '2.0', id, result };
  } catch (e) {
    return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : 'Hata' }] } };
  }
}
