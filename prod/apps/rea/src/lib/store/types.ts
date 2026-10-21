import type { Digest, Finding, Flow, Project, Run, RunSummary, TargetKind } from '../types';

export interface NewProject {
  name: string;
  target_kind: TargetKind;
  target_url: string | null;
  upload_path: string | null;
  upload_name: string | null;
  upload_bytes: number | null;
  question: string;
  seeds: string[];
}
export type RunPatch = Partial<Pick<Run, 'status' | 'stage' | 'progress' | 'message' | 'log' | 'error' | 'summary' | 'digest' | 'evidence_bytes' | 'evidence_truncated' | 'started_at' | 'finished_at'>> & { evidence?: unknown };

export interface ProjectWithRun extends Project { last_run: Pick<Run, 'id' | 'status' | 'progress' | 'finished_at' | 'summary'> | null; has_finding: boolean }

export interface Store {
  listProjects(orgId: string): Promise<ProjectWithRun[]>;
  getProject(orgId: string, id: string): Promise<Project | null>;
  createProject(orgId: string, userId: string | null, input: NewProject): Promise<Project>;
  updateProject(orgId: string, id: string, patch: Partial<Pick<Project, 'status' | 'question' | 'seeds' | 'name' | 'upload_path' | 'upload_name' | 'upload_bytes'>>): Promise<void>;
  deleteProject(orgId: string, id: string): Promise<void>;
  createRun(project: Project): Promise<Run>;
  getRun(orgId: string, id: string): Promise<Run | null>;
  latestRun(orgId: string, projectId: string): Promise<Run | null>;
  updateRun(orgId: string, id: string, patch: RunPatch): Promise<void>;
  listFindings(orgId: string, projectId: string): Promise<Finding[]>;
  addFinding(orgId: string, userId: string | null, f: { project_id: string; run_id: string | null; title: string; body: Flow; model: string | null }): Promise<Finding>;
}
export type { Digest, RunSummary };
