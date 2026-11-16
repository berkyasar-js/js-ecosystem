import { emailProviderStatus, sendEmail } from '@jscore/core/notify/email';
import { renderInstantEmail } from '@jscore/core/notify/templates';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';

export const dynamic = 'force-dynamic';

/** GET: e-posta sağlayıcı durumu (Resend / yalnızca günlük) + son 20 gönderim (email_log). Demo: durum yalnızca. */
export const GET = adminRoute(async (ctx) => {
  const status = emailProviderStatus();
  if (!ctx.sb) return ok({ status, log: [], demo: true });
  const { data, error } = await ctx.sb.from('email_log').select('id,user_id,kind,to_email,subject,status,provider_id,error,created_at').eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return ok({ status, log: data ?? [], demo: false });
});

/** POST: oturumdaki yöneticinin adresine deneme e-postası; sonuç email_log'a (kind 'test') ve denetime yazılır. */
export const POST = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  if (!ctx.email) return ok({ error: 'Oturumun e-posta adresi yok' }, 400);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://js-ecosystem-app.vercel.app';
  const { data: org } = await sb.from('organizations').select('name').eq('id', ctx.orgId).maybeSingle();
  const m = renderInstantEmail({ kind: 'system', title: 'Deneme e-postası', body: 'E-posta sağlayıcısı çalışıyor. Bu ileti Ana Yönetim Paneli → Entegrasyonlar → E-posta’dan gönderildi.', href: '/app/profile?tab=notifications' }, { appUrl, orgName: org?.name ?? 'Organizasyon', recipientName: ctx.email, preferencesUrl: `${appUrl}/app/profile?tab=notifications` });
  const r = await sendEmail({ to: ctx.email, subject: `[Deneme] ${m.subject}`, html: m.html, text: m.text });
  await sb.from('email_log').insert({ org_id: ctx.orgId, user_id: ctx.userId, kind: 'test', to_email: ctx.email, subject: `[Deneme] ${m.subject}`, status: r.status, provider_id: r.provider_id ?? null, error: r.error ?? null });
  await audit(ctx, 'email.test', `email/${ctx.email}`, { status: r.status, provider: r.provider, error: r.error ?? null }, r.status === 'error' ? 'error' : 'allow');
  return ok({ result: r });
});
