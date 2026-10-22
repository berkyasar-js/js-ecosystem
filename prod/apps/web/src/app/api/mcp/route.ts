import { fail, json } from '@jscore/core/api';
import { handleMcp, hashToken, RepoMcpBackend } from '@/lib/mcp';
import { DemoRepo } from '@jscore/core/repo/demo';
import { SupabaseRepo } from '@jscore/core/repo/supabase';
import { DEMO_MCP_TOKEN } from '@jscore/core/demo-seed';
import { isSupabaseConfigured } from '@jscore/core/env';
import { createAdmin } from '@jscore/core/supabase/admin';
import { authenticateBearer } from '@jscore/core/tokens-server';

/** Token doğrulama: Authorization: Bearer <token>; sha256(token) ↔ access_tokens.token_hash. Demo: DEMO_MCP_TOKEN. */
export async function POST(req: Request) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Bearer token gerekli' } }, 401);
    let backend: RepoMcpBackend;
    if (isSupabaseConfigured()) {
      const admin = createAdmin();
      if (!admin) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanımlı değil' }, 503);
      // access_tokens: sha256 özeti, iptal/süre kontrolü ve 'mcp' kapsamı (lib/tokens-server.ts); son kullanım güncellenir.
      const auth = await authenticateBearer(token, 'mcp');
      if (!auth) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Token geçersiz, süresi dolmuş veya iptal edilmiş' } }, 401);
      backend = new RepoMcpBackend(new SupabaseRepo(admin, auth.org_id));
    } else {
      if (hashToken(token) !== hashToken(process.env.DEMO_MCP_TOKEN || DEMO_MCP_TOKEN)) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Token geçersiz' } }, 401);
      backend = new RepoMcpBackend(new DemoRepo({ accountId: 'account' }));
    }
    const res = await handleMcp(await req.json().catch(() => null), backend);
    return res ? json(res) : new Response(null, { status: 202 });
  } catch (e) { return fail(e); }
}
