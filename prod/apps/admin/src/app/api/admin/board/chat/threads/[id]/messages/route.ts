import { boardMessageCreateSchema, type BoardMessage } from '@jscore/contracts';
import { askBoard, boardChatClient } from '@jscore/core/agents/board-chat';
import { enforceAgentCap } from '@jscore/core/agents/cap';
import { json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { audit, adminRoute, ok } from '@/lib/route';
import { chatStore, demoReply, historyTurns, orgSnapshot, parseModelOutput, shouldSummarize, summaryTurns, systemPrompt, validateAttachments } from '@/lib/board-chat';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
type P = { params: Promise<{ id: string }> };

export const GET = adminRoute(async (ctx, _req, { params }: P) => {
  const { id } = await params;
  const store = chatStore(ctx);
  const thread = await store.getThread(id);
  if (!thread) return json({ error: 'Konu bulunamadı' }, 404);
  return ok({ thread, messages: await store.listMessages(id) });
});

/**
 * Kurucu mesajı → (demo ya da Claude) kurul yanıtı. Yanıt {reply, plan} JSON'u olarak beklenir; ayrıştırılamazsa ham metin yanıt olur.
 * Maliyet agent_runs'a (agent 'chair', trigger 'board_chat') yazılır; aylık tavan 402 ile uygulanır.
 */
export const POST = adminRoute(async (ctx, req, { params }: P) => {
  const { id } = await params;
  const store = chatStore(ctx);
  const thread = await store.getThread(id);
  if (!thread) return json({ error: 'Konu bulunamadı' }, 404);
  if (thread.status === 'archived') return json({ error: 'Arşivlenmiş konuya mesaj yazılamaz; önce konuyu açın' }, 400);
  const v = boardMessageCreateSchema.parse(await req.json().catch(() => null));
  const att = validateAttachments(v.attachments);
  if (!att.ok) return json({ error: att.error }, 400);

  const client = ctx.mode === 'demo' ? null : boardChatClient();
  const demo = !client;
  if (!demo) {
    const repo = await getRepo();
    await enforceAgentCap({ repo, spendRepo: ctx.sb ? new SupabaseRepo(ctx.sb, ctx.orgId) : undefined, agent: 'chair' });
  }

  const user = await store.addMessage({ thread_id: id, role: 'user', content: v.content, attachments: att.attachments, plan: null, tokens_in: 0, tokens_out: 0, cost_usd: 0 });
  const snap = await orgSnapshot(ctx);
  const history = await store.listMessages(id);

  let out: ReturnType<typeof parseModelOutput>;
  let usage = { model: 'demo', tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0 };
  let summary: string | null = null;
  if (demo) {
    out = demoReply(v.content, att.attachments, snap);
  } else {
    const t0 = Date.now();
    try {
      const res = await askBoard({ client, system: systemPrompt(snap, thread.summary), turns: historyTurns(history) });
      out = parseModelOutput(res.text);
      usage = { model: res.model, tokens_in: res.tokens_in, tokens_out: res.tokens_out, cost_usd: res.cost_usd, latency_ms: res.latency_ms };
      if (shouldSummarize(history.length, !!thread.summary)) {
        const st = summaryTurns(history, thread.summary);
        if (st) {
          const s = await askBoard({ client, system: 'Sen bir toplantı sekreterisin. Yalnızca istenen özeti düz metin olarak döndür.', turns: st, maxTokens: 1500 });
          summary = s.text.trim();
          usage = { ...usage, tokens_in: usage.tokens_in + s.tokens_in, tokens_out: usage.tokens_out + s.tokens_out, cost_usd: Math.round((usage.cost_usd + s.cost_usd) * 100000) / 100000, latency_ms: Date.now() - t0 };
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Model çağrısı başarısız';
      if (ctx.sb) await ctx.sb.from('agent_runs').insert({ org_id: ctx.orgId, agent: 'chair', trigger: 'board_chat', input: { thread_id: id, message_id: user.id }, output: { error: msg }, model: 'claude-sonnet-4-5', status: 'error', latency_ms: Date.now() - t0 });
      await audit(ctx, 'board.chat.message', `board_thread:${id}`, { error: msg }, 'error');
      return json({ error: `Kurul yanıt veremedi: ${msg}`, user }, 502);
    }
  }

  const assistant: BoardMessage = await store.addMessage({ thread_id: id, role: 'assistant', content: out.reply, attachments: [], plan: out.plan ?? null, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, cost_usd: usage.cost_usd });
  if (summary !== null) await store.patchThread(id, { summary });
  if (thread.title === 'Yeni konu' && v.content.trim()) await store.patchThread(id, { title: v.content.trim().split('\n')[0].slice(0, 80) });
  if (ctx.sb && !demo) {
    const { error } = await ctx.sb.from('agent_runs').insert({
      org_id: ctx.orgId, agent: 'chair', trigger: 'board_chat', input: { thread_id: id, message_id: user.id, attachments: att.attachments.map((a) => ({ name: a.name, bytes: a.bytes })) },
      output: { message_id: assistant.id, reply_chars: out.reply.length, plan: !!out.plan, tasks: out.plan?.tasks.length ?? 0, summarized: summary !== null },
      model: usage.model, tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, cost_usd: usage.cost_usd, latency_ms: usage.latency_ms, status: 'ok',
    });
    if (error) console.error('agent_runs yazılamadı', error.message);
  }
  await audit(ctx, 'board.chat.message', `board_thread:${id}`, { message_id: user.id, assistant_id: assistant.id, cost_usd: usage.cost_usd, plan: !!out.plan, demo });
  return ok({ user, assistant: { ...assistant, demo }, thread: await store.getThread(id) }, 201);
});
