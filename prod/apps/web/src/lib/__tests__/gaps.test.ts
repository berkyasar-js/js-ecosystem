import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Automation, Task } from '@jscore/contracts';
import { CapExceededError, capLabel, capStatus, enforceAgentCap, estimateRunCostUsd } from '../agents/cap';
import { demoTwinBids } from '../agents/demo';
import { fail } from '../api';
import { dispatchEvent, isSafeWebhookUrl, matches, resolveRule, type AutomationEvent, type DispatchPorts } from '../automations/dispatch';
import { supabasePorts } from '../automations/supabase-ports';
import { requestBids } from '../bids';
import { signBody, verifyHmac } from '../hmac';
import { hashToken } from '../mcp';
import { DemoRepo, DEMO_STORAGE_KEY, type KV } from '../repo/demo';
import { ForbiddenError, type Repo } from '../repo/types';
import { sha256Hex, tokenUsable } from '../token';

const mem = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const NOW = '2026-10-14T10:00:00Z';
const demo = (accountId: string, storage: KV | null = mem()) => new DemoRepo({ accountId, storage, now: () => NOW });

describe('1 · aylık ajan maliyet tavanı', () => {
  const ai = { monthly_cap_usd: 10, default_model: 'm', board_enabled: true, usd_try: 40 };
  it('₺ gösterimi ve oran: "Bu ay: ₺X / tavan ₺Y"', () => {
    const s = capStatus(2.5, ai);
    expect(s).toMatchObject({ spentTry: 100, capTry: 400, pct: 25, exceeded: false, unlimited: false });
    expect(capLabel(s)).toBe('Bu ay: ₺100 / tavan ₺400');
    expect(capStatus(0, { ...ai, monthly_cap_usd: 0 }).unlimited).toBe(true);
    expect(capStatus(10, ai).exceeded).toBe(true);
  });
  it('ay içi harcama yalnızca o ayın agent_runs maliyetlerini toplar', async () => {
    const r = demo('owner');
    const base = { agent: 'cfo' as const, trigger: 't', input: {}, output: {}, model: 'x', tokens_in: 1, tokens_out: 1, latency_ms: 1, status: 'ok' as const };
    const before = await r.monthlyAgentSpend('2026-10');
    await r.logAgentRun({ ...base, cost_usd: 1.25 });
    expect(await r.monthlyAgentSpend('2026-10')).toBeCloseTo(before + 1.25, 5);
    expect(await r.monthlyAgentSpend('2026-09')).toBe(0);
  });
  it('tahmini çalıştırma maliyeti geçmiş ortalamadan; yoksa varsayılan', () => {
    expect(estimateRunCostUsd('cfo', [{ agent: 'cfo', cost_usd: 2, status: 'ok', created_at: 'a' }, { agent: 'cfo', cost_usd: 4, status: 'ok', created_at: 'b' }])).toBe(3);
    expect(estimateRunCostUsd('cfo', [])).toBeGreaterThan(0);
  });
  it('tavan aşılırsa CapExceededError → HTTP 402 + Türkçe mesaj; altındaysa ve 0 = sınırsız geçer', async () => {
    const r = demo('owner');
    await r.saveSettings({ ai: { ...(await r.getSettings()).ai, monthly_cap_usd: 5 } });
    await expect(enforceAgentCap({ repo: r, agent: 'chair', spendOverrideUsd: 5 })).rejects.toBeInstanceOf(CapExceededError);
    await expect(enforceAgentCap({ repo: r, agent: 'chair', spendOverrideUsd: 4.99 })).rejects.toBeInstanceOf(CapExceededError); // + tahmini çalıştırma tavanı aşar
    await expect(enforceAgentCap({ repo: r, agent: 'chair', spendOverrideUsd: 1 })).resolves.toMatchObject({ exceeded: false });
    await r.saveSettings({ ai: { ...(await r.getSettings()).ai, monthly_cap_usd: 0 } });
    await expect(enforceAgentCap({ repo: r, agent: 'chair', spendOverrideUsd: 9999 })).resolves.toMatchObject({ unlimited: true });
    // demo istemcisi tavanı da bildirir (sunucu durumsuz)
    await expect(enforceAgentCap({ repo: new DemoRepo({ accountId: 'owner' }), agent: 'chair', spendOverrideUsd: 3, capOverrideUsd: 3 })).rejects.toThrow(/₺120.*tavan ₺120/);
    const res = fail(new CapExceededError(capStatus(5, { ...ai, monthly_cap_usd: 5 })));
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toMatch(/maliyet tavanı/);
  });
});

describe('2 · API anahtarları', () => {
  it('düz token yalnızca dönüşte; depoda yok; listeleme/iptal; yetki', async () => {
    const storage = mem();
    const owner = demo('owner', storage);
    const { token, plaintext } = await owner.createToken({ name: 'Claude Desktop', scopes: ['mcp', 'work:read'], expires_in_days: 30 });
    expect(plaintext).toMatch(/^jsk_[0-9a-f]{64}$/);
    expect(token.token_prefix).toBe(`${plaintext.slice(0, 8)}…`);
    expect(token.expires_at).toBe('2026-11-13T10:00:00.000Z');
    expect(storage.data[DEMO_STORAGE_KEY]).not.toContain(plaintext);
    expect((await owner.getConnect()).tokens.some((t) => t.id === token.id)).toBe(true);
    await owner.revokeToken(token.id);
    expect((await owner.getConnect()).tokens.some((t) => t.id === token.id)).toBe(false);
    await expect(owner.revokeToken(token.id)).rejects.toThrow();
    await expect(demo('account').createToken({ name: 'x y', scopes: ['mcp'] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(owner.createToken({ name: 'kötü', scopes: ['payroll:read'] })).rejects.toThrow();
    await expect(owner.createToken({ name: 'boş', scopes: [] })).rejects.toThrow();
  });
  it('sha256 özeti mcp hashToken ile aynı; token kuralları: iptal, süre, kapsam', async () => {
    expect(await sha256Hex('jsdemo_token')).toBe(hashToken('jsdemo_token'));
    const row = { id: 'i', org_id: 'o', scopes: ['mcp'], expires_at: null, revoked_at: null };
    expect(tokenUsable(row, 'mcp', NOW)).toBe(true);
    expect(tokenUsable(row, 'webhooks', NOW)).toBe(false);
    expect(tokenUsable({ ...row, revoked_at: NOW }, 'mcp', NOW)).toBe(false);
    expect(tokenUsable({ ...row, expires_at: '2026-10-14T09:59:59Z' }, 'mcp', NOW)).toBe(false);
    expect(tokenUsable({ ...row, expires_at: '2026-10-15T00:00:00Z' }, 'mcp', NOW)).toBe(true);
    expect(tokenUsable(null, 'mcp', NOW)).toBe(false);
  });
});

describe('3 · ikiz ihalesi (twin bids)', () => {
  const setup = async (account = 'account', storage: KV = mem()) => {
    const r = demo(account, storage);
    const low = await r.createTask({ project_id: 'p1', title: 'Normal öncelik görsel', due_at: '2026-10-20', task_type: 'main_visual', planned_minutes: 480 });
    const high = await r.createTask({ project_id: 'p1', title: 'Acil banner seti', due_at: '2026-10-16', priority: 'high', task_type: 'social_visual', planned_minutes: 240 });
    return { r, low, high };
  };
  it('deterministik 2–3 teklif; opt-out ve rol ikizleri dışarıda; yeniden açınca eskiler çekilir', async () => {
    const { r, low } = await setup();
    const bids = await r.openTaskForBids(low.id);
    expect(bids.length).toBeGreaterThanOrEqual(2);
    expect(bids.length).toBeLessThanOrEqual(3);
    expect(bids.every((b) => b.status === 'open' && b.employee_id && b.confidence >= 0 && b.confidence <= 100 && b.eta_hours > 0)).toBe(true);
    expect(bids.map((b) => b.twin_id)).not.toContain('tw3'); // opt-out
    expect(bids.map((b) => b.twin_id)).not.toContain('tw4'); // rol ikizi
    const again = await demo('account').openTaskForBids('t1');
    expect(again.map((b) => [b.twin_id, b.confidence])).toEqual((await demo('account').openTaskForBids('t1')).map((b) => [b.twin_id, b.confidence]));
    const reopened = await r.openTaskForBids(low.id);
    const all = await r.listTaskBids(low.id);
    expect(all.filter((b) => b.status === 'withdrawn')).toHaveLength(bids.length);
    expect(all.filter((b) => b.status === 'open')).toHaveLength(reopened.length);
  });
  it('normal öncelik: Ata → task_assignments + assignee + won/lost + olay (otomasyon tetiklenir)', async () => {
    const storage = mem();
    const { r, low } = await setup('account', storage);
    await demo('owner', storage).save('automations', { name: 'Atama bildirimi', trigger: 'task_assignments.insert', condition: '', action: 'Operasyona bildirim', action_kind: 'notify', action_config: { message: 'Atandı: {{new.task_id}}' }, status: 'published', version: 1, template: null, runs: 0, history: [] });
    const bids = await r.openTaskForBids(low.id);
    const res = await r.assignFromBid(bids[0].id);
    expect(res.status).toBe('assigned');
    const task = (await r.listTasks()).find((t) => t.id === low.id) as Task;
    expect(task.assignee_id).toBe(bids[0].employee_id);
    expect((await r.listTaskAssignments(low.id))[0]).toMatchObject({ task_id: low.id, bid_id: bids[0].id, employee_id: bids[0].employee_id });
    const after = await r.listTaskBids(low.id);
    expect(after.find((b) => b.id === bids[0].id)?.status).toBe('won');
    expect(after.filter((b) => b.id !== bids[0].id).every((b) => b.status === 'lost')).toBe(true);
    expect((await demo('owner', storage).list('automation_runs')).some((x) => x.event_type === 'task_assignments.insert' && x.status === 'ok')).toBe(true);
    await expect(r.assignFromBid(bids[0].id)).rejects.toBeInstanceOf(ForbiddenError); // artık açık değil
  });
  it('yüksek öncelik: onay kapısı — onaylanınca atanır, ikinci istek aynı onayı döndürür', async () => {
    const storage = mem();
    const acct = new DemoRepo({ accountId: 'account', storage, now: () => NOW });
    const high = await acct.createTask({ project_id: 'p1', title: 'Acil banner seti', due_at: '2026-10-16', priority: 'high', task_type: 'social_visual' });
    const bids = await acct.openTaskForBids(high.id);
    const first = await acct.assignFromBid(bids[0].id);
    expect(first.status).toBe('pending_approval');
    expect((await acct.listTasks()).find((t) => t.id === high.id)?.assignee_id).toBeNull();
    const approval = (await acct.listApprovals()).find((a) => a.subject.bid_id === bids[0].id);
    expect(approval).toMatchObject({ status: 'pending', action_type: 'scope', required_role: 'operations' });
    expect(await acct.assignFromBid(bids[0].id)).toEqual({ status: 'pending_approval', approval_id: approval?.id });
    expect((await acct.listApprovals()).filter((a) => a.subject.bid_id === bids[0].id)).toHaveLength(1);
    await expect(acct.decideApproval(approval!.id, 'approved')).rejects.toBeInstanceOf(ForbiddenError); // account operations onayını veremez
    await new DemoRepo({ accountId: 'owner', storage, now: () => NOW }).decideApproval(approval!.id, 'approved');
    const reader = new DemoRepo({ accountId: 'account', storage, now: () => NOW });
    expect((await reader.listTasks()).find((t) => t.id === high.id)?.assignee_id).toBe(bids[0].employee_id);
    expect((await reader.listTaskBids(high.id)).find((b) => b.id === bids[0].id)?.status).toBe('won');
  });
  it('yetki: creative ihaleye açamaz/atayamaz; client teklifleri göremez', async () => {
    const { low } = await setup();
    await expect(demo('creative').openTaskForBids(low.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(demo('client_viewer').listTaskBids()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('Supabase yolu: twin_bid ajanı çıktısı zod ile doğrulanıp openTaskForBids’e verilir', async () => {
    const open = vi.fn(async () => []);
    const repo = { mode: 'supabase', openTaskForBids: open, listTwins: async () => [
      { id: 'tw1', org_id: 'o', employee_id: 'e1', kind: 'person', name: 'A · ikiz', profile: { skills: ['Ana görsel'] }, defaults: { weekly_hours: 30 }, preferences: {}, opt_out: false, approved_by_owner_at: 'x' },
      { id: 'tw9', org_id: 'o', employee_id: 'e9', kind: 'person', name: 'Z · ikiz', profile: {}, defaults: {}, preferences: {}, opt_out: true, approved_by_owner_at: 'x' },
    ] } as unknown as Repo;
    const task = { id: 't', title: 'x y', task_type: 'main_visual', priority: 'normal', planned_minutes: 60 } as Task;
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { agent: string; input: { twins: Array<{ id: string }> } };
      expect(sent.agent).toBe('twin_bid');
      expect(sent.input.twins.map((t) => t.id)).toEqual(['tw1']); // opt-out ikiz sunucuya gönderilmez
      return new Response(JSON.stringify({ output: { summary: 's', bids: [{ twin_id: 'tw1', confidence: 80, eta_hours: 3, rationale: 'r' }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    await requestBids(repo, task, f);
    expect(open).toHaveBeenCalledWith('t', [{ twin_id: 'tw1', confidence: 80, eta_hours: 3, rationale: 'r' }]);
    const bad = (async () => new Response(JSON.stringify({ error: 'Aylık yapay zekâ maliyet tavanı aşılacak' }), { status: 402 })) as unknown as typeof fetch;
    await expect(requestBids(repo, task, bad)).rejects.toThrow(/tavan/);
  });
  it('demoTwinBids deterministik ve beceriye duyarlı', () => {
    const input = { task: { id: 'x', title: 'a b', task_type: 'reels', planned_minutes: 240 }, twins: [{ id: 'a', name: 'A', skills: ['Offline kurgu', 'Motion'] }, { id: 'b', name: 'B', skills: ['Teklif'] }] };
    const out = demoTwinBids(input);
    expect(out).toEqual(demoTwinBids(input));
    expect(out.bids[0].twin_id).toBe('a');
  });
});

describe('4 · otomasyon dispatcher', () => {
  const rule = (o: Partial<Automation>): Automation => ({ id: 'au9', org_id: 'o', created_at: 'c', name: 'Kural', trigger: 'task.state = delivery', condition: '', action: 'Operasyona bildirim', status: 'published', version: 1, template: null, runs: 0, history: [], ...o });
  const ev = (o: Partial<AutomationEvent> & { payload: AutomationEvent['payload'] }): AutomationEvent => ({ org_id: 'o', type: 'tasks.update', aggregate: 'tasks', aggregate_id: 't1', ...o });
  const fakePorts = (rules: Automation[]) => {
    const calls = { runs: [] as unknown[], notify: [] as unknown[], tasks: [] as unknown[], states: [] as unknown[], hooks: [] as Array<[string, string]> };
    const ports: DispatchPorts = {
      now: () => NOW, rules: async () => rules,
      logRun: async (_o, r) => { calls.runs.push(r); }, touchRule: async () => {},
      notify: async (_o, n) => { calls.notify.push(n); }, createTask: async (_o, i) => { calls.tasks.push(i); return { id: 'tn' }; },
      setTaskState: async (_o, id, s) => { calls.states.push([id, s]); }, webhook: async (u, b) => { calls.hooks.push([u, b]); },
    };
    return { ports, calls };
  };
  it('eski tetikleyici metinleri olay+filtreye çözülür; geçiş semantiği (alan değişmeli)', () => {
    expect(resolveRule(rule({}))).toEqual({ event: 'tasks.update', filter: { 'new.state': 'delivery' } });
    expect(resolveRule(rule({ trigger: 'invoice.overdue' }))?.event).toBe('invoices.update');
    expect(resolveRule(rule({ trigger: 'saçma metin' }))).toBeNull();
    const r = resolveRule(rule({}))!;
    expect(matches(r, ev({ payload: { new: { state: 'delivery' }, old: { state: 'approval' } } }))).toBe(true);
    expect(matches(r, ev({ payload: { new: { state: 'delivery' }, old: { state: 'delivery' } } }))).toBe(false); // başka alan değişti
    expect(matches(r, ev({ payload: { new: { state: 'brief' }, old: { state: 'approval' } } }))).toBe(false);
    expect(matches({ event: 'candidates.update', filter: { 'new.stage': 'offer' } }, ev({ type: 'candidates.update', payload: { new: { data: { stage: 'offer' } }, old: { data: { stage: 'interview' } } } }))).toBe(true); // jsonb data yolu
  });
  it('yalnızca yayındaki kurallar; her aksiyon türü; hata günlüğe düşer', async () => {
    const e = ev({ payload: { new: { state: 'delivery', title: 'Banner', project_id: 'p1' }, old: { state: 'approval' } } });
    const { ports, calls } = fakePorts([
      rule({ id: 'a1', action_kind: 'notify', action_config: { message: 'Teslim: {{new.title}}' } }),
      rule({ id: 'a2', action_kind: 'create_task', action_config: { title: 'Takip · {{new.title}}' } }),
      rule({ id: 'a3', action_kind: 'set_status', action_config: { state: 'archive' } }),
      rule({ id: 'a4', action_kind: 'webhook', action_config: { url: 'https://example.com/hook' } }),
      rule({ id: 'a5', action_kind: 'webhook', action_config: { url: 'http://127.0.0.1/x' } }),
      rule({ id: 'a6', status: 'draft' }),
    ]);
    const res = await dispatchEvent(e, ports);
    expect(res.map((r) => [r.automation_id, r.status])).toEqual([['a1', 'ok'], ['a2', 'ok'], ['a3', 'ok'], ['a4', 'ok'], ['a5', 'error']]);
    expect(calls.notify).toEqual([{ title: 'Kural', body: 'Teslim: Banner', href: '/app/automations' }]);
    expect(calls.tasks[0]).toMatchObject({ project_id: 'p1', title: 'Takip · Banner', source_ref: 'automation:a2', state: 'brief' });
    expect(calls.states).toEqual([['t1', 'archive']]);
    expect(JSON.parse(calls.hooks[0][1])).toMatchObject({ event: { type: 'tasks.update' }, automation: { id: 'a4' } });
    expect(calls.runs).toHaveLength(5);
    expect(isSafeWebhookUrl('https://hooks.example.com/a')).toBe(true);
    expect(['http://localhost/x', 'http://10.0.0.1/', 'ftp://a.com', 'http://169.254.169.254/', 'nope'].some(isSafeWebhookUrl)).toBe(false);
  });
  it('döngü koruması: otomasyonun oluşturduğu görev yeniden tetiklemez', async () => {
    const { ports, calls } = fakePorts([rule({ trigger: 'task.created', action_kind: 'notify' })]);
    expect(await dispatchEvent(ev({ type: 'tasks.insert', payload: { new: { source_ref: 'automation:au1' } } }), ports)).toEqual([]);
    expect((await dispatchEvent(ev({ type: 'tasks.insert', payload: { new: { source_ref: null } } }), ports)).length).toBe(1);
    expect(calls.notify).toHaveLength(1);
  });
  it('Supabase webhook portu gövdeyi JSCORE_WEBHOOK_SECRET ile HMAC-SHA256 imzalar (lib/hmac.ts)', async () => {
    const f = vi.fn(async () => new Response('ok', { status: 200 }));
    const body = '{"a":1}';
    await supabasePorts({} as never, { webhookSecret: 's3', fetch: f as unknown as typeof fetch }).webhook('https://example.com/h', body);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    const sig = (init.headers as Record<string, string>)['x-jscore-signature'];
    expect(sig).toBe(`sha256=${signBody(body, 's3')}`);
    expect(verifyHmac(body, sig, 's3')).toBe(true);
    await expect(supabasePorts({} as never, {}).webhook('https://example.com/h', body)).rejects.toThrow(/JSCORE_WEBHOOK_SECRET/);
    await expect(supabasePorts({} as never, { webhookSecret: 's3', fetch: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch }).webhook('https://example.com/h', body)).rejects.toThrow(/500/);
  });
  it('Demo: DemoRepo yazması olay üretir, yayındaki kural senkron tetiklenir (son tetiklenme + günlük + bildirim); taslak tetiklenmez', async () => {
    const r = demo('owner');
    const csat = (await r.list('automations')).find((a) => a.id === 'au1')!;
    expect(csat.status).toBe('published');
    const draft = await r.save('automations', { name: 'Taslak kural', trigger: 'task.state = delivery', condition: '', action: 'Operasyona bildirim', status: 'draft', version: 1, template: null, runs: 0, history: [] });
    const notifBefore = (await r.list('notifications')).length;
    await r.moveTask('t3', 'delivery');
    const after = (await r.list('automations')).find((a) => a.id === 'au1')!;
    expect(after.runs).toBe(csat.runs + 1);
    expect(after.last_fired_at).toBe(NOW);
    expect((await r.list('automations')).find((a) => a.id === draft.id)?.runs).toBe(0);
    const log = (await r.list('automation_runs')).filter((x) => x.event_type === 'tasks.update');
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ automation_id: 'au1', status: 'ok' });
    expect((await r.list('notifications')).length).toBeGreaterThan(notifBefore);
    await r.moveTask('t3', 'delivery'); // aynı aşamaya yeniden taşıma → geçiş yok → tetiklenmez
    expect((await r.list('automation_runs')).filter((x) => x.event_type === 'tasks.update')).toHaveLength(1);
  });
  it('Demo: görev oluşturma aksiyonu ve onay olayı; kendi görevleri döngü yapmaz', async () => {
    const r = demo('owner');
    await r.save('automations', { name: 'Yeni onay → görev', trigger: 'approval.created', condition: '', action: 'Görev oluştur', action_kind: 'create_task', action_config: { title: 'Onay takibi: {{new.title}}', project_id: 'p1' }, status: 'published', version: 1, template: null, runs: 0, history: [] });
    const n = (await r.listTasks()).length;
    await r.createApproval({ action_type: 'content', title: 'Test onayı', required_role: 'account', due_at: '2026-10-20' });
    const tasks = await r.listTasks();
    expect(tasks).toHaveLength(n + 1);
    expect(tasks.at(-1)).toMatchObject({ title: 'Onay takibi: Test onayı', source_ref: expect.stringMatching(/^automation:/) });
  });
});

describe('5 · migration 0006', () => {
  const sql = readFileSync(join(__dirname, '../../../../../packages/schema/supabase/migrations/0006_gaps.sql'), 'utf8');
  it('yeni tablolar RLS’li ve politikalı; processed_at, token alanları ve atama fonksiyonları var', () => {
    for (const t of ['twin_bids', 'task_assignments']) {
      expect(sql).toContain(`create table public.${t}`);
      expect(sql).toContain(`alter table public.${t} enable row level security`);
      expect(sql).toMatch(new RegExp(`create policy \\w+ on public\\.${t} for select`));
    }
    expect(sql).toContain('add column if not exists processed_at');
    expect(sql).toMatch(/access_tokens add column if not exists expires_at/);
    expect(sql).toMatch(/function public\.assign_bid/);
    expect(sql).toMatch(/trigger approvals_bid_finalize/);
    expect(sql).toMatch(/status in \('open','won','lost','withdrawn'\)/);
  });
});
