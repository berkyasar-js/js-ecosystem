import { fail, json } from '@/lib/api';
import { pushRecentDetailEvents, pushTaskNow } from '@/lib/integrations/trello-push';
import { getRepo } from '@/lib/repo';
import { createAdmin } from '@/lib/supabase/admin';

/**
 * Satır içi (best-effort) JS → Trello itmesi: Supabase deposu görev yazdıktan hemen sonra çağırır. Yetki: oturumlu iç rol (görev yazabilen).
 * Görev oturumdaki org'a ait olmalı; Trello bağlı değil / mode ≠ two_way ise sessizce `skipped`. Cron (/api/events/dispatch) aynı işi
 * olaylardan yeniden yapar; itme idempotenttir (fark yoksa Trello'ya yazılmaz).
 */
const PUSH_ROLES = ['owner', 'org_admin', 'operations', 'account', 'pm', 'creative', 'freelancer', 'integration_admin'];
export async function POST(req: Request) {
  try {
    const admin = createAdmin();
    if (!admin) return json({ ok: true, result: 'skipped' });
    const me = await (await getRepo()).me();
    if (!me) return json({ error: 'Oturum yok' }, 401);
    if (!PUSH_ROLES.includes(me.role)) return json({ ok: true, result: 'skipped' });
    const body = (await req.json().catch(() => null)) as { task_id?: unknown; prev_assignee?: unknown; details?: unknown } | null;
    if (body?.details === true) return json({ ok: true, ...(await pushRecentDetailEvents(admin, me.org_id)) });
    if (!body || typeof body.task_id !== 'string') return json({ error: 'task_id gerekli' }, 400);
    const result = await pushTaskNow(admin, me.org_id, body.task_id, undefined, { prevAssignee: typeof body.prev_assignee === 'string' ? body.prev_assignee : null });
    return json({ ok: true, result });
  } catch (e) { return fail(e); }
}
