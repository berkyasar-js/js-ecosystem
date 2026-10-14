import { fail, json } from '@/lib/api';
import { handleMcp, hashToken, RepoMcpBackend } from '@/lib/mcp';
import { DemoRepo } from '@/lib/repo/demo';
import { SupabaseRepo } from '@/lib/repo/supabase';
import { DEMO_MCP_TOKEN } from '@/lib/demo-seed';
import { isSupabaseConfigured } from '@/lib/env';
import { createAdmin } from '@/lib/supabase/admin';

/** Token doğrulama: Authorization: Bearer <token>; sha256(token) ↔ access_tokens.token_hash. Demo: DEMO_MCP_TOKEN. */
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Bearer token gerekli' } }, 401);
    let backend: RepoMcpBackend;
    if (isSupabaseConfigured()) {
      const admin = createAdmin();
      if (!admin) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanımlı değil' }, 503);
      const { data } = await admin.from('access_tokens').select('id,org_id,scopes').eq('token_hash', hashToken(token)).is('revoked_at', null).maybeSingle();
      if (!data || !(data.scopes as string[]).includes('mcp')) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Token geçersiz' } }, 401);
      void admin.from('access_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
      backend = new RepoMcpBackend(new SupabaseRepo(admin, data.org_id as string));
    } else {
      if (hashToken(token) !== hashToken(process.env.DEMO_MCP_TOKEN || DEMO_MCP_TOKEN)) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Token geçersiz' } }, 401);
      backend = new RepoMcpBackend(new DemoRepo({ accountId: 'account' }));
    }
    const res = await handleMcp(await req.json().catch(() => null), backend);
    return res ? json(res) : new Response(null, { status: 202 });
  } catch (e) { return fail(e); }
}
