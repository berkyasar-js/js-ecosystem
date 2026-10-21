import type { SupabaseClient } from '@supabase/supabase-js';
import type { Finding, Project, Run } from '../types';
import type { NewProject, ProjectWithRun, RunPatch, Store } from './types';

const RUN_COLS = 'id,project_id,org_id,status,stage,progress,message,log,error,summary,digest,evidence_bytes,evidence_truncated,started_at,finished_at,created_at';

function fail(e: { message: string } | null): void { if (e) throw new Error(e.message); }

/** `rea` şeması üzerinde Store. Kullanıcı istemcisiyle RLS, admin istemcisiyle (arka plan işçisi) RLS atlanır — her iki durumda da org_id süzgeci açıkça uygulanır. */
export function supabaseStore(sb: SupabaseClient): Store {
  const rea = () => sb.schema('rea');
  return {
    async listProjects(orgId) {
      const { data, error } = await rea().from('projects').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
      fail(error);
      const projects = (data ?? []) as Project[];
      if (!projects.length) return [];
      const ids = projects.map((p) => p.id);
      const [runs, finds] = await Promise.all([
        rea().from('runs').select('id,project_id,status,progress,finished_at,summary,created_at').in('project_id', ids).order('created_at', { ascending: false }),
        rea().from('findings').select('project_id').in('project_id', ids),
      ]);
      fail(runs.error); fail(finds.error);
      const lastBy = new Map<string, NonNullable<ProjectWithRun['last_run']>>();
      for (const r of (runs.data ?? []) as Array<NonNullable<ProjectWithRun['last_run']> & { project_id: string }>) if (!lastBy.has(r.project_id)) lastBy.set(r.project_id, r);
      const withF = new Set((finds.data ?? []).map((f: { project_id: string }) => f.project_id));
      return projects.map((p) => ({ ...p, last_run: lastBy.get(p.id) ?? null, has_finding: withF.has(p.id) }));
    },
    async getProject(orgId, id) {
      const { data, error } = await rea().from('projects').select('*').eq('org_id', orgId).eq('id', id).maybeSingle();
      fail(error); return (data as Project | null) ?? null;
    },
    async createProject(orgId, userId, input: NewProject) {
      const { data, error } = await rea().from('projects').insert({ ...input, org_id: orgId, created_by: userId }).select('*').single();
      fail(error); return data as Project;
    },
    async updateProject(orgId, id, patch) {
      const { error } = await rea().from('projects').update(patch).eq('org_id', orgId).eq('id', id); fail(error);
    },
    async deleteProject(orgId, id) {
      const { error } = await rea().from('projects').delete().eq('org_id', orgId).eq('id', id); fail(error);
    },
    async createRun(project) {
      const { data, error } = await rea().from('runs').insert({ project_id: project.id, org_id: project.org_id, status: 'queued', stage: 'hazirlik', message: 'Sıraya alındı' }).select(RUN_COLS).single();
      fail(error); return data as Run;
    },
    async getRun(orgId, id) {
      const { data, error } = await rea().from('runs').select(RUN_COLS).eq('org_id', orgId).eq('id', id).maybeSingle();
      fail(error); return (data as Run | null) ?? null;
    },
    async latestRun(orgId, projectId) {
      const { data, error } = await rea().from('runs').select(RUN_COLS).eq('org_id', orgId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(1);
      fail(error); return ((data ?? [])[0] as Run | undefined) ?? null;
    },
    async updateRun(orgId, id, patch: RunPatch) {
      const { error } = await rea().from('runs').update(patch).eq('org_id', orgId).eq('id', id); fail(error);
    },
    async listFindings(orgId, projectId) {
      const { data, error } = await rea().from('findings').select('*').eq('org_id', orgId).eq('project_id', projectId).order('created_at', { ascending: false });
      fail(error); return (data ?? []) as Finding[];
    },
    async addFinding(orgId, userId, f) {
      const { data, error } = await rea().from('findings').insert({ ...f, org_id: orgId, kind: 'synthesis', created_by: userId }).select('*').single();
      fail(error); return data as Finding;
    },
  };
}
