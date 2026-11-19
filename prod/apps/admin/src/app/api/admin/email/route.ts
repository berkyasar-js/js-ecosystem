import { EMAIL_PROVIDERS, type EmailProviderChoice } from '@jscore/contracts';
import { emailProviderStatus } from '@jscore/core/notify/email';
import { orgEmailStatus, resolveOrgSender } from '@jscore/core/notify/email-gmail';
import { renderInstantEmail } from '@jscore/core/notify/templates';
import { audit, adminRoute, ok, requireService, isResponse } from '@/lib/route';

export const dynamic = 'force-dynamic';

/** GET: etkin sağlayıcı (Gmail / Resend / yalnızca günlük) + seçim + son 20 gönderim (email_log). Demo: yalnızca env durumu. */
export const GET = adminRoute(async (ctx) => {
  if (!ctx.sb) return ok({ status: { ...emailProviderStatus(), choice: null, gmail_connected: false, gmail_from: null }, log: [], demo: true });
  const [status, { data, error }] = await Promise.all([
    orgEmailStatus(ctx.sb, ctx.orgId),
    ctx.sb.from('email_log').select('id,user_id,kind,to_email,subject,status,provider_id,error,created_at').eq('org_id', ctx.orgId).order('created_at', { ascending: false }).limit(20),
  ]);
  if (error) throw new Error(error.message);
  return ok({ status, log: data ?? [], demo: false });
});

/** PUT { provider: 'gmail' | 'resend' | 'off' } → settings.notifications.email_provider (denetim: admin.email.provider). */
export const PUT = adminRoute(async (ctx, req) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  const body = (await req.json().catch(() => null)) as { provider?: unknown } | null;
  const provider = body?.provider as EmailProviderChoice;
  if (!EMAIL_PROVIDERS.includes(provider)) return ok({ error: 'Geçersiz sağlayıcı' }, 400);
  const { data: org, error } = await sb.from('organizations').select('settings').eq('id', ctx.orgId).maybeSingle();
  if (error) throw new Error(error.message);
  const settings = ((org as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  const notifications = ((settings.notifications as Record<string, unknown> | undefined) ?? { rules: [] });
  const next = { ...settings, notifications: { ...notifications, rules: notifications.rules ?? [], email_provider: provider } };
  const { error: ue } = await sb.from('organizations').update({ settings: next }).eq('id', ctx.orgId);
  if (ue) throw new Error(ue.message);
  await audit(ctx, 'email.provider', 'settings/notifications', { provider });
  return ok({ status: await orgEmailStatus(sb, ctx.orgId) });
});

/** POST: oturumdaki yöneticinin adresine deneme e-postası (etkin sağlayıcıyla); sonuç email_log'a (kind 'test') ve denetime yazılır. */
export const POST = adminRoute(async (ctx) => {
  const sb = requireService(ctx); if (isResponse(sb)) return sb;
  if (!ctx.email) return ok({ error: 'Oturumun e-posta adresi yok' }, 400);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://js-ecosystem-app.vercel.app';
  const { data: org } = await sb.from('organizations').select('name').eq('id', ctx.orgId).maybeSingle();
  const m = renderInstantEmail({ kind: 'system', title: 'Deneme e-postası', body: 'E-posta sağlayıcısı çalışıyor. Bu ileti Ana Yönetim Paneli → Entegrasyonlar → E-posta’dan gönderildi.', href: '/app/profile?tab=notifications' }, { appUrl, orgName: org?.name ?? 'Organizasyon', recipientName: ctx.email, preferencesUrl: `${appUrl}/app/profile?tab=notifications` });
  const { send, status } = await resolveOrgSender(sb, ctx.orgId);
  const r = await send({ to: ctx.email, subject: `[Deneme] ${m.subject}`, html: m.html, text: m.text });
  await sb.from('email_log').insert({ org_id: ctx.orgId, user_id: ctx.userId, kind: 'test', to_email: ctx.email, subject: `[Deneme] ${m.subject}`, status: r.status, provider_id: r.provider_id ?? null, error: r.error ?? null });
  await audit(ctx, 'email.test', `email/${ctx.email}`, { status: r.status, provider: r.provider, error: r.error ?? null }, r.status === 'error' ? 'error' : 'allow');
  return ok({ result: r, status });
});
