import { randomUUID } from 'node:crypto';
import type { Finding, Project, Run } from '../types';
import { sampleFinding, sampleProject, sampleRun, DEMO_ORG } from '../sample';
import type { NewProject, ProjectWithRun, RunPatch, Store } from './types';

interface Mem { projects: Map<string, Project>; runs: Map<string, Run>; findings: Map<string, Finding> }
const g = globalThis as unknown as { __reaMem?: Mem };

function mem(): Mem {
  if (!g.__reaMem) {
    const m: Mem = { projects: new Map(), runs: new Map(), findings: new Map() };
    const p = sampleProject(); const r = sampleRun(p.id); const f = sampleFinding(p.id, r.id);
    m.projects.set(p.id, p); m.runs.set(r.id, r); m.findings.set(f.id, f);
    g.__reaMem = m;
  }
  return g.__reaMem;
}
const now = () => new Date().toISOString();

/** DEMO modu: bellekte (sunucu örneği yeniden başlayınca sıfırlanır). */
export const memoryStore: Store = {
  async listProjects(orgId) {
    const m = mem();
    return [...m.projects.values()].filter((p) => p.org_id === orgId).sort((a, b) => b.created_at.localeCompare(a.created_at)).map<ProjectWithRun>((p) => {
      const lr = [...m.runs.values()].filter((r) => r.project_id === p.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return { ...p, last_run: lr ? { id: lr.id, status: lr.status, progress: lr.progress, finished_at: lr.finished_at, summary: lr.summary } : null, has_finding: [...m.findings.values()].some((f) => f.project_id === p.id) };
    });
  },
  async getProject(orgId, id) { const p = mem().projects.get(id); return p && p.org_id === orgId ? p : null; },
  async createProject(orgId, _u, input: NewProject) {
    const p: Project = { id: randomUUID(), org_id: orgId, ...input, status: 'draft', created_at: now(), updated_at: now() };
    mem().projects.set(p.id, p); return p;
  },
  async updateProject(orgId, id, patch) { const p = mem().projects.get(id); if (p && p.org_id === orgId) Object.assign(p, patch, { updated_at: now() }); },
  async deleteProject(orgId, id) {
    const m = mem(); const p = m.projects.get(id); if (!p || p.org_id !== orgId) return;
    m.projects.delete(id);
    for (const [k, r] of m.runs) if (r.project_id === id) m.runs.delete(k);
    for (const [k, f] of m.findings) if (f.project_id === id) m.findings.delete(k);
  },
  async createRun(project) {
    const r: Run = { id: randomUUID(), project_id: project.id, org_id: project.org_id, status: 'queued', stage: 'hazirlik', progress: 0, message: 'Sıraya alındı', log: [], error: null, summary: null, digest: null, evidence_bytes: null, evidence_truncated: false, started_at: null, finished_at: null, created_at: now() };
    mem().runs.set(r.id, r); return r;
  },
  async getRun(orgId, id) { const r = mem().runs.get(id); return r && r.org_id === orgId ? r : null; },
  async latestRun(orgId, projectId) {
    return [...mem().runs.values()].filter((r) => r.project_id === projectId && r.org_id === orgId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  },
  async updateRun(orgId, id, patch: RunPatch) {
    const r = mem().runs.get(id); if (!r || r.org_id !== orgId) return;
    const { evidence: _ev, ...rest } = patch; void _ev;
    Object.assign(r, rest);
  },
  async listFindings(orgId, projectId) { return [...mem().findings.values()].filter((f) => f.project_id === projectId && f.org_id === orgId).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
  async addFinding(orgId, _u, f) {
    const row: Finding = { id: randomUUID(), org_id: orgId, kind: 'synthesis', created_at: now(), ...f };
    mem().findings.set(row.id, row); return row;
  },
};
export { DEMO_ORG };
