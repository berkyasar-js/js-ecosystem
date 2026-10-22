import { describe, expect, it, vi } from 'vitest';
import { signBody, verifyHmac } from '@jscore/core/hmac';
import { RepoMcpBackend, handleMcp, hashToken } from '../mcp';
import { DemoRepo } from '@jscore/core/repo/demo';
import { runAgent, type MessagesClient } from '@jscore/core/agents/run';
import type { Repo } from '@jscore/core/repo/types';

describe('HMAC verify', () => {
  const body = JSON.stringify({ event: 'invoice.paid', id: 7 });
  const sig = signBody(body, 's3cret');
  it('accepts hex and sha256= prefixed signatures', () => {
    expect(verifyHmac(body, sig, 's3cret')).toBe(true);
    expect(verifyHmac(body, `sha256=${sig}`, 's3cret')).toBe(true);
    expect(verifyHmac(body, `SHA256=${sig.toUpperCase()}`, 's3cret')).toBe(true);
  });
  it('rejects tampered body, wrong secret, missing/short signature or secret', () => {
    expect(verifyHmac(body + ' ', sig, 's3cret')).toBe(false);
    expect(verifyHmac(body, sig, 'other')).toBe(false);
    expect(verifyHmac(body, null, 's3cret')).toBe(false);
    expect(verifyHmac(body, 'abcd', 's3cret')).toBe(false);
    expect(verifyHmac(body, sig, undefined)).toBe(false);
  });
});

describe('MCP handler', () => {
  const backend = () => new RepoMcpBackend(new DemoRepo({ accountId: 'account' }));
  const call = (name: string, args: unknown) => handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, backend());
  it('initialize + tools/list', async () => {
    const init = await handleMcp({ jsonrpc: '2.0', id: 0, method: 'initialize' }, backend());
    expect((init?.result as { serverInfo: { name: string } }).serverInfo.name).toBe('jscore-mcp');
    const list = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, backend());
    expect((list?.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(['project_status', 'create_task_draft']);
  });
  it('project_status reports overdue tasks', async () => {
    const r = await call('project_status', { project_id: 'p1' });
    const rows = JSON.parse((r?.result as { content: { text: string }[] }).content[0].text);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'p1', flow_stage: 'internal_review' });
  });
  it('create_task_draft validates and creates a brief-stage task', async () => {
    const ok = await call('create_task_draft', { project_id: 'p1', title: 'MCP taslağı' });
    expect(JSON.parse((ok?.result as { content: { text: string }[] }).content[0].text)).toMatchObject({ title: 'MCP taslağı', state: 'brief', persisted: false });
    expect((await call('create_task_draft', { project_id: 'p1' }))?.error?.code).toBe(-32602);
    expect((await call('nope', {}))?.error?.code).toBe(-32601);
  });
  it('errors, notifications and unknown methods', async () => {
    expect((await handleMcp({ nope: true }, backend()))?.error?.code).toBe(-32600);
    expect(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, backend())).toBeNull();
    expect((await handleMcp({ jsonrpc: '2.0', id: 9, method: 'resources/list' }, backend()))?.error?.code).toBe(-32601);
    const bad = await call('create_task_draft', { project_id: 'zzz', title: 'Olmayan proje' });
    expect((bad?.result as { isError?: boolean }).isError).toBe(true);
  });
  it('hashToken is sha256 hex', () => { expect(hashToken('a')).toMatch(/^[0-9a-f]{64}$/); expect(hashToken('a')).toBe(hashToken('a')); });
});

describe('runAgent', () => {
  it('returns canned output in demo mode without calling the model', async () => {
    const client: MessagesClient = { messages: { create: vi.fn() } };
    const r = await runAgent({ agent: 'inbox_drafts', input: { body: '2 görsel' }, repo: new DemoRepo({ accountId: 'account' }), client });
    expect(client.messages.create).not.toHaveBeenCalled();
    expect(r.run.status).toBe('demo');
    expect((r.output as { drafts: { qty: number }[] }).drafts[0].qty).toBe(2);
  });
  it('real path: validates JSON, logs cost; rejects schema violations', async () => {
    const logged: unknown[] = [];
    const repo = {
      mode: 'supabase',
      getActivePrompt: async () => ({ id: 'p', agent: 'inbox_drafts', version: 1, system_prompt: 'sys', model: 'claude-haiku-4-5', output_schema: {}, is_active: true }),
      logAgentRun: async (r: unknown) => { logged.push(r); },
    } as unknown as Repo;
    const reply = (text: string) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 1000 } }) } }) as unknown as MessagesClient;
    const good = '```json\n{"summary":"ok","drafts":[{"title":"Görsel","task_type":"social_visual","qty":1,"priority":"normal","due_at":"2026-10-20","rationale":""}]}\n```';
    const r = await runAgent({ agent: 'inbox_drafts', input: {}, repo, client: reply(good) });
    expect(r.run).toMatchObject({ status: 'ok', cost_usd: 0.006, model: 'claude-haiku-4-5' });
    expect(logged).toHaveLength(1);
    await expect(runAgent({ agent: 'inbox_drafts', input: {}, repo, client: reply('{"nope":1}') })).rejects.toThrow('şemaya');
    expect((logged[1] as { status: string }).status).toBe('error');
  });
});
