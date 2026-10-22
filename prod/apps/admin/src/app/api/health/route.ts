import { isSupabaseConfigured } from '@jscore/core/env';

export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ ok: true, app: 'admin', mode: isSupabaseConfigured() ? 'supabase' : 'demo', time: new Date().toISOString() });
}
