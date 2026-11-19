import { type MailFilter } from '@jscore/contracts';
import { fail } from '@jscore/core/api';
import { loadGoogleOrgConfig } from '@jscore/core/integrations/google-oauth';
import { googleFail, isResponse, requireUser } from '@/lib/google-user';

export const dynamic = 'force-dynamic';
const FILTERS: MailFilter[] = ['all', 'matched', 'unmatched', 'unread'];
/**
 * GET ?filter=all|matched|unmatched|unread&archived=0|1&q=&limit=100 → { connected, mailbox, threads }.
 * İç roller (müşteri rolleri 403). Servis rolü ile org süzgeci (RLS eşdeğeri: core.is_internal).
 */
export async function GET(req: Request) {
  try {
    const a = await requireUser({ internal: true }); if (isResponse(a)) return a;
    const url = new URL(req.url);
    const filter = (FILTERS.includes(url.searchParams.get('filter') as MailFilter) ? url.searchParams.get('filter') : 'all') as MailFilter;
    const archived = url.searchParams.get('archived') === '1';
    const limit = Math.min(300, Math.max(10, Number(url.searchParams.get('limit') ?? 100) || 100));
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const cfg = await loadGoogleOrgConfig(a.admin, a.me.org_id).catch(() => null);
    let sel = a.admin.from('mail_threads').select('*').eq('org_id', a.me.org_id).eq('archived', archived).order('last_message_at', { ascending: false }).limit(limit);
    if (filter === 'matched') sel = sel.not('client_id', 'is', null);
    if (filter === 'unmatched') sel = sel.is('client_id', null);
    if (filter === 'unread') sel = sel.eq('unread', true);
    if (q) sel = sel.or(`subject.ilike.%${q.replace(/[%,()]/g, ' ')}%,from_email.ilike.%${q.replace(/[%,()]/g, ' ')}%,snippet.ilike.%${q.replace(/[%,()]/g, ' ')}%`);
    const { data, error } = await sel;
    if (error) throw new Error(error.message);
    return Response.json({ connected: !!cfg, mailbox: cfg?.email ?? null, gmail_scope: !!cfg && (cfg.scopes.includes('https://www.googleapis.com/auth/gmail.readonly') || cfg.scopes.includes('https://www.googleapis.com/auth/gmail.modify')), last_sync_at: cfg?.last_sync_at ?? null, threads: data ?? [] }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) { return googleFail(e) ?? fail(e); }
}
