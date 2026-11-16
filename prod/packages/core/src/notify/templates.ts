import { notificationKindLabel, type Approval, type Notification, type Task } from '@jscore/contracts';

/**
 * Türkçe e-posta şablonları (saf: metin + HTML üretir, ağ yok). Derin bağlantılar `appUrl` ile kurulur.
 * Anlık: onay istendi / anma / görev atandı. Özet: günlük (08:30) ve haftalık (Pazartesi).
 */
export interface MailCtx { appUrl: string; orgName: string; recipientName: string; unsubscribeUrl?: string | null; preferencesUrl?: string | null }
export interface RenderedMail { subject: string; html: string; text: string }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const abs = (appUrl: string, href: string) => (/^https?:\/\//.test(href) ? href : `${appUrl.replace(/\/$/, '')}${href.startsWith('/') ? '' : '/'}${href}`);
export const fmtTrDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return m ? `${Number(d)} ${months[Number(m) - 1]} ${y}` : iso;
};

function layout(ctx: MailCtx, title: string, bodyHtml: string, bodyText: string): RenderedMail {
  const footerLinks = [
    ctx.preferencesUrl ? `<a href="${esc(ctx.preferencesUrl)}" style="color:#6b7280">Bildirim tercihleri</a>` : '',
    ctx.unsubscribeUrl ? `<a href="${esc(ctx.unsubscribeUrl)}" style="color:#6b7280">E-posta bildirimlerini kapat</a>` : '',
  ].filter(Boolean).join(' · ');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden">
<tr><td style="background:#1b25e0;color:#fff;padding:16px 22px;font-weight:700;font-size:15px">${esc(ctx.orgName)} <span style="opacity:.75;font-weight:500">· JS Ecosystem</span></td></tr>
<tr><td style="padding:22px">
<p style="margin:0 0 14px;font-size:14px;color:#374151">Merhaba ${esc(ctx.recipientName.split(/\s+/)[0] || ctx.recipientName)},</p>
${bodyHtml}
</td></tr>
<tr><td style="padding:14px 22px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">Bu e-posta ${esc(ctx.orgName)} çalışma alanındaki bildirim tercihlerine göre gönderildi.${footerLinks ? `<br>${footerLinks}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\nMerhaba ${ctx.recipientName},\n\n${bodyText}\n\n—\n${ctx.orgName} · JS Ecosystem${ctx.preferencesUrl ? `\nBildirim tercihleri: ${ctx.preferencesUrl}` : ''}${ctx.unsubscribeUrl ? `\nE-posta bildirimlerini kapat: ${ctx.unsubscribeUrl}` : ''}`;
  return { subject: title, html, text };
}
const button = (href: string, label: string) => `<p style="margin:18px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:#1b25e0;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:10px 16px;border-radius:10px">${esc(label)}</a></p>`;

/* ───────── Anlık ───────── */
const INSTANT_SUBJECT: Record<string, string> = { approval_requested: 'Onay sırası sende', mention: 'Seni andılar', task_assigned: 'Sana görev atandı' };
const INSTANT_CTA: Record<string, string> = { approval_requested: 'Onayı aç', mention: 'Göreve git', task_assigned: 'Görevi aç' };
export function renderInstantEmail(n: Pick<Notification, 'kind' | 'title' | 'body' | 'href'>, ctx: MailCtx): RenderedMail {
  const href = abs(ctx.appUrl, n.href ?? '/app/inbox');
  const subject = `${INSTANT_SUBJECT[n.kind] ?? notificationKindLabel(n.kind)}: ${n.title.replace(/^[^:]{0,40}:\s*/, '')}`.slice(0, 160);
  const html = `<h1 style="margin:0 0 6px;font-size:18px">${esc(n.title)}</h1><p style="margin:0;color:#374151;font-size:14px">${esc(n.body)}</p>${button(href, INSTANT_CTA[n.kind] ?? 'Uygulamada aç')}`;
  const text = `${n.title}\n${n.body}\n\n${INSTANT_CTA[n.kind] ?? 'Aç'}: ${href}`;
  return layout(ctx, subject, html, text);
}

/* ───────── Özet ───────── */
export interface DigestInput {
  period: 'daily' | 'weekly'; today: string; /** Haftalık: pencere başlangıcı (dahil). */ since?: string;
  employeeId: string; tasks: Task[]; /** Benim sıramdaki bekleyen onaylar. */ approvals: Array<Pick<Approval, 'id' | 'title' | 'due_at' | 'action_type'>>;
  unread: number; announcements: Array<{ id: string; title: string; created_at: string }>;
}
export interface DigestSection { key: 'overdue' | 'due_today' | 'due_week' | 'approvals' | 'announcements' | 'unread'; title: string; items: Array<{ title: string; meta?: string; href: string }>; count: number }
export interface DigestContent { period: 'daily' | 'weekly'; sections: DigestSection[]; empty: boolean; headline: string }
const isDone = (t: Pick<Task, 'state'>) => t.state === 'delivery' || t.state === 'archive';
const taskHref = (t: Pick<Task, 'id' | 'project_id'>) => `/app/projects/${t.project_id}?task=${t.id}`;
const plusDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/** Saf: özet içeriği (bölümler). Boş bölümler düşer; her şey boşsa `empty=true` (e-posta gönderilmez). */
export function buildDigest(i: DigestInput): DigestContent {
  const mine = i.tasks.filter((t) => t.assignee_id === i.employeeId && !isDone(t));
  const due = (t: Task) => t.due_at?.slice(0, 10) ?? '';
  const overdue = mine.filter((t) => due(t) && due(t) < i.today).sort((a, b) => due(a).localeCompare(due(b)));
  const today = mine.filter((t) => due(t) === i.today);
  const weekEnd = plusDays(i.today, 7);
  const week = mine.filter((t) => due(t) > i.today && due(t) <= weekEnd).sort((a, b) => due(a).localeCompare(due(b)));
  const sections: DigestSection[] = [];
  const push = (key: DigestSection['key'], title: string, items: DigestSection['items']) => { if (items.length) sections.push({ key, title, items: items.slice(0, 15), count: items.length }); };
  push('overdue', 'Geciken işlerin', overdue.map((t) => ({ title: t.title, meta: `${fmtTrDate(t.due_at)} · gecikti`, href: taskHref(t) })));
  push('due_today', i.period === 'daily' ? 'Bugün biten işlerin' : 'Bugün bitenler', today.map((t) => ({ title: t.title, meta: 'bugün', href: taskHref(t) })));
  if (i.period === 'weekly') push('due_week', 'Bu hafta bitenler', week.map((t) => ({ title: t.title, meta: fmtTrDate(t.due_at), href: taskHref(t) })));
  push('approvals', 'Bekleyen onayların', i.approvals.map((a) => ({ title: a.title, meta: a.due_at ? `son ${fmtTrDate(a.due_at)}` : a.action_type, href: '/app/approvals' })));
  const anns = i.since ? i.announcements.filter((a) => a.created_at.slice(0, 10) >= i.since!) : i.announcements.filter((a) => a.created_at.slice(0, 10) >= plusDays(i.today, -1));
  push('announcements', 'Duyurular', anns.map((a) => ({ title: a.title, meta: fmtTrDate(a.created_at), href: '/app/announcements' })));
  if (i.unread > 0) sections.push({ key: 'unread', title: 'Okunmamış bildirim', items: [{ title: `${i.unread} okunmamış bildirimin var`, href: '/app/inbox' }], count: i.unread });
  const parts = [overdue.length ? `${overdue.length} geciken` : '', today.length ? `${today.length} bugün biten` : '', i.approvals.length ? `${i.approvals.length} bekleyen onay` : ''].filter(Boolean);
  const headline = parts.length ? parts.join(' · ') : 'Her şey yolunda';
  return { period: i.period, sections, empty: sections.length === 0, headline };
}

export function renderDigestEmail(d: DigestContent, ctx: MailCtx & { today: string }): RenderedMail {
  const title = d.period === 'daily' ? `Günlük özet · ${fmtTrDate(ctx.today)} — ${d.headline}` : `Haftalık özet · ${fmtTrDate(ctx.today)} — ${d.headline}`;
  const html = d.sections.map((s) => `<h2 style="margin:18px 0 6px;font-size:14px;color:#111827">${esc(s.title)} <span style="color:#6b7280;font-weight:500">(${s.count})</span></h2>
<ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">${s.items.map((it) => `<li style="margin:3px 0"><a href="${esc(abs(ctx.appUrl, it.href))}" style="color:#1b25e0;text-decoration:none">${esc(it.title)}</a>${it.meta ? ` <span style="color:#6b7280">· ${esc(it.meta)}</span>` : ''}</li>`).join('')}${s.count > s.items.length ? `<li style="color:#6b7280">… ve ${s.count - s.items.length} daha</li>` : ''}</ul>`).join('') + button(abs(ctx.appUrl, '/app/overview'), 'Ana sayfayı aç');
  const text = d.sections.map((s) => `${s.title} (${s.count})\n${s.items.map((it) => `  - ${it.title}${it.meta ? ` · ${it.meta}` : ''} → ${abs(ctx.appUrl, it.href)}`).join('\n')}`).join('\n\n') + `\n\nAna sayfa: ${abs(ctx.appUrl, '/app/overview')}`;
  return layout(ctx, title, html, text);
}
