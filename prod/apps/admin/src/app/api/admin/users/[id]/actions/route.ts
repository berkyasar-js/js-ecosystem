import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { json } from '@jscore/core/api';
import { SUPABASE_ANON, SUPABASE_URL } from '@jscore/core/env';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';
import { appCallback, canAssignRole } from '@/lib/users';
import type { Role } from '@jscore/contracts';

type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ action: z.enum(['reset_password', 'send_magic_link', 'copy_link', 'resend_invite', 'revoke_sessions', 'reset_mfa']), link_type: z.enum(['magiclink', 'recovery']).optional() });

/** Parola/oturum/MFA süreçleri. E-posta gönderenler anon istemciyle (Supabase SMTP), bağlantı üretenler servis rolüyle çalışır. */
export const POST = adminRoute(async (ctx, req, { params }: Ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'Geçersiz kullanıcı' }, 400);
  const { action, link_type } = bodySchema.parse(await req.json().catch(() => null));
  const { data: mem } = await sb.from('memberships').select('role').eq('org_id', ctx.orgId).eq('user_id', id).maybeSingle();
  if (!mem) return json({ error: 'Bu organizasyonda böyle bir üye yok' }, 404);
  if (!canAssignRole(ctx.role, mem.role as Role)) return json({ error: 'Owner üzerinde yalnızca owner işlem yapabilir' }, 403);
  const { data: got, error: ue } = await sb.auth.admin.getUserById(id);
  const user = got?.user;
  if (ue || !user?.email) return json({ error: 'Kullanıcı bulunamadı' }, 404);
  const email = user.email;
  const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const done = async (extra: Record<string, unknown> = {}) => { await audit(ctx, `user.${action}`, `user:${id}`, { email, ...(action === 'copy_link' ? { link_type } : {}) }); return ok(extra); };
  const failed = async (msg: string) => { await audit(ctx, `user.${action}`, `user:${id}`, { email, error: msg }, 'error'); return json({ error: msg }, 502); };

  switch (action) {
    case 'reset_password': {
      const { error } = await anon().auth.resetPasswordForEmail(email, { redirectTo: appCallback() });
      return error ? failed(error.message) : done();
    }
    case 'send_magic_link': {
      const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: appCallback() } });
      return error ? failed(error.message) : done();
    }
    case 'copy_link': {
      const { data, error } = await sb.auth.admin.generateLink({ type: link_type ?? 'magiclink', email, options: { redirectTo: appCallback() } });
      return error ? failed(error.message) : done({ link: data.properties?.action_link ?? null });
    }
    case 'resend_invite': {
      const { error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: appCallback() });
      return error ? failed(error.message) : done();
    }
    case 'revoke_sessions': {
      const { data, error } = await sb.rpc('admin_revoke_sessions', { p_user: id });
      return error ? failed(`${error.message} (0014_admin.sql uygulandı mı?)`) : done({ revoked: data });
    }
    case 'reset_mfa': {
      const { data, error } = await sb.auth.admin.mfa.listFactors({ userId: id });
      if (error) return failed(error.message);
      let n = 0;
      for (const f of data.factors) { const r = await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: id }); if (!r.error) n++; }
      return done({ removed: n });
    }
  }
});
