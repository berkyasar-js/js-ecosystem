import { boardThreadCreateSchema } from '@jscore/contracts';
import { audit, adminRoute, ok } from '@/lib/route';
import { chatStore } from '@/lib/board-chat';

export const dynamic = 'force-dynamic';

/** Kurul Sohbeti konuları (açık + arşiv). */
export const GET = adminRoute(async (ctx) => ok({ threads: await chatStore(ctx).listThreads(), mode: ctx.mode }));

export const POST = adminRoute(async (ctx, req) => {
  const v = boardThreadCreateSchema.parse(await req.json().catch(() => ({})));
  const thread = await chatStore(ctx).createThread(v.title, ctx.userId);
  await audit(ctx, 'board.chat.thread.create', `board_thread:${thread.id}`, { title: thread.title });
  return ok({ thread }, 201);
});
