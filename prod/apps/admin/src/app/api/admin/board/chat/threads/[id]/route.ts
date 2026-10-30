import { boardThreadPatchSchema } from '@jscore/contracts';
import { json } from '@jscore/core/api';
import { audit, adminRoute, ok } from '@/lib/route';
import { chatStore } from '@/lib/board-chat';

export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string }> };

export const PATCH = adminRoute(async (ctx, req, { params }: P) => {
  const { id } = await params;
  const v = boardThreadPatchSchema.parse(await req.json().catch(() => null));
  const thread = await chatStore(ctx).patchThread(id, v);
  if (!thread) return json({ error: 'Konu bulunamadı' }, 404);
  await audit(ctx, 'board.chat.thread.update', `board_thread:${id}`, v);
  return ok({ thread });
});

export const DELETE = adminRoute(async (ctx, _req, { params }: P) => {
  const { id } = await params;
  const removed = await chatStore(ctx).deleteThread(id);
  if (!removed) return json({ error: 'Konu bulunamadı' }, 404);
  await audit(ctx, 'board.chat.thread.delete', `board_thread:${id}`);
  return ok({ ok: true });
});
