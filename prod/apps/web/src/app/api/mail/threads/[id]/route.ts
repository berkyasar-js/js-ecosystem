import { isValidEmail } from '@jscore/core/notify/email';
import { fail, json } from '@jscore/core/api';
import { archiveThread, markThreadRead, rematchThreads, replyToThread } from '@jscore/core/integrations/gmail';
import { loadGoogleOrgConfig } from '@jscore/core/integrations/google-oauth';
import { googleFail, isResponse, requireUser } from '@/lib/google-user';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const res = (d: unknown, status = 200) => Response.json(d, { status, headers: { 'cache-control': 'no-store' } });

/** GET → { thread, messages } (iç roller). */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const a = await requireUser({ internal: true }); if (isResponse(a)) return a;
    const { id } = await ctx.params; if (!UUID.test(id)) return json({ error: 'Geçersiz id' }, 400);
    const { data: thread, error } = await a.admin.from('mail_threads').select('*').eq('org_id', a.me.org_id).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message); if (!thread) return json({ error: 'Konu bulunamadı' }, 404);
    const { data: messages } = await a.admin.from('mail_messages').select('*').eq('thread_id', id).order('date');
    return res({ thread, messages: messages ?? [] });
  } catch (e) { return googleFail(e) ?? fail(e); }
}

type Action =
  | { action: 'read' } | { action: 'archive' } | { action: 'reply'; text: string }
  | { action: 'link'; client_id: string | null; brand_id?: string | null; contact_id?: string | null }
  | { action: 'add_contact'; client_id: string; brand_id?: string | null; name?: string; email?: string }
  | { action: 'convert'; title?: string; brand_id?: string | null };
/**
 * POST { action }: read (okundu) · archive (Gmail etiketi + yerel) · reply (Gmail ile aynı konuda yanıt) · link (müşteriye bağla / kaldır)
 * · add_contact (göndereni müşteri kişisi olarak ekle + eşle) · convert (talep oluştur, request_id bağla). İç roller; CRM yazmaları owner/org_admin/operations/account/pm.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const a = await requireUser({ internal: true }); if (isResponse(a)) return a;
    const { id } = await ctx.params; if (!UUID.test(id)) return json({ error: 'Geçersiz id' }, 400);
    const body = (await req.json().catch(() => null)) as Action | null;
    if (!body?.action) return json({ error: 'action gerekli' }, 400);
    const { data: thread, error } = await a.admin.from('mail_threads').select('*').eq('org_id', a.me.org_id).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message); if (!thread) return json({ error: 'Konu bulunamadı' }, 404);
    const crmWrite = ['owner', 'org_admin', 'operations', 'account', 'pm'].includes(a.me.role);
    const now = new Date().toISOString();
    const t = thread as { id: string; subject: string; snippet: string; from_email: string; from_name: string; brand_id: string | null; client_id: string | null; request_id: string | null };
    switch (body.action) {
      case 'read': await markThreadRead(a.admin, a.me.org_id, id); break;
      case 'archive': if (!crmWrite) return json({ error: 'Yetkin yok' }, 403); await archiveThread(a.admin, a.me.org_id, id); break;
      case 'reply': {
        if (!crmWrite) return json({ error: 'Yetkin yok' }, 403);
        const r = await replyToThread(a.admin, a.me.org_id, id, { text: String(body.text ?? ''), actorName: a.me.name });
        return res({ ok: true, ...r });
      }
      case 'link': {
        if (!crmWrite) return json({ error: 'Yetkin yok' }, 403);
        let brand = body.brand_id ?? null;
        if (body.client_id && !brand) { const { data: bs } = await a.admin.from('brands').select('id').eq('org_id', a.me.org_id).eq('client_id', body.client_id); if ((bs ?? []).length === 1) brand = (bs as Array<{ id: string }>)[0].id; }
        const { error: ue } = await a.admin.from('mail_threads').update({ client_id: body.client_id ?? null, brand_id: body.client_id ? brand : null, contact_id: body.client_id ? (body.contact_id ?? null) : null, updated_at: now }).eq('id', id);
        if (ue) throw new Error(ue.message);
        break;
      }
      case 'add_contact': {
        if (!crmWrite) return json({ error: 'Yetkin yok' }, 403);
        const email = (body.email ?? t.from_email).trim().toLowerCase();
        if (!isValidEmail(email)) return json({ error: 'Geçersiz e-posta' }, 400);
        if (!UUID.test(body.client_id)) return json({ error: 'Müşteri gerekli' }, 400);
        const name = (body.name ?? t.from_name).trim() || email.split('@')[0];
        const { data: existing } = await a.admin.from('client_contacts').select('id,client_id,brand_id').eq('org_id', a.me.org_id).ilike('email', email).maybeSingle();
        type Contact = { id: string; client_id: string; brand_id: string | null };
        let contact = existing as Contact | null;
        if (!contact) {
          const { data: c, error: ce } = await a.admin.from('client_contacts').insert({ org_id: a.me.org_id, client_id: body.client_id, brand_id: body.brand_id ?? null, name, email, data: { source: 'inbox' } }).select('id,client_id,brand_id').single();
          if (ce) throw new Error(ce.message); contact = c as Contact;
        }
        await a.admin.from('mail_threads').update({ client_id: contact!.client_id, brand_id: contact!.brand_id ?? body.brand_id ?? null, contact_id: contact!.id, updated_at: now }).eq('id', id);
        const cfg = await loadGoogleOrgConfig(a.admin, a.me.org_id).catch(() => null);
        const rematched = cfg ? await rematchThreads(a.admin, a.me.org_id, cfg.email) : 0;
        return res({ ok: true, contact_id: contact!.id, rematched });
      }
      case 'convert': {
        if (!crmWrite && a.me.role !== 'creative') return json({ error: 'Yetkin yok' }, 403);
        if (t.request_id) return json({ error: 'Bu konu zaten talebe dönüştürüldü', request_id: t.request_id }, 409);
        const { data: last } = await a.admin.from('mail_messages').select('text').eq('thread_id', id).order('date', { ascending: false }).limit(1).maybeSingle();
        const title = (body.title ?? t.subject).trim().slice(0, 160) || '(konu yok)';
        const bodyText = `${t.from_name ? `${t.from_name} <${t.from_email}>` : t.from_email} · e-posta\n\n${((last as { text?: string } | null)?.text ?? t.snippet).slice(0, 4000)}\n\nKaynak: Gelen Kutusu → E-posta (${id})`;
        const { data: reqRow, error: re } = await a.admin.from('requests').insert({ org_id: a.me.org_id, brand_id: body.brand_id ?? t.brand_id ?? null, project_id: null, task_id: null, kind: 'client', status: 'new', data: { title, body: bodyText, requester_employee_id: a.me.employee_id ?? null, requester_name: t.from_name || t.from_email, client_visible: false, source_ref: `mail:${id}` } }).select('id').single();
        if (re) throw new Error(re.message);
        const rid = (reqRow as { id: string }).id;
        await a.admin.from('mail_threads').update({ request_id: rid, unread: false, updated_at: now }).eq('id', id);
        await a.admin.from('audit_events').insert({ org_id: a.me.org_id, actor: a.me.id, action: 'mail.convert', resource: `requests/${rid}`, outcome: 'allow', meta: { thread: id } }).then(() => undefined, () => undefined);
        return res({ ok: true, request_id: rid });
      }
      default: return json({ error: 'Bilinmeyen eylem' }, 400);
    }
    const { data: fresh } = await a.admin.from('mail_threads').select('*').eq('id', id).maybeSingle();
    return res({ ok: true, thread: fresh });
  } catch (e) { return googleFail(e) ?? fail(e); }
}
