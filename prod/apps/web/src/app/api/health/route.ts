import { json } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';
export function GET() {
  return json({ ok: true, mode: isSupabaseConfigured() ? 'supabase' : 'demo', anthropic: Boolean(process.env.ANTHROPIC_API_KEY), webhook_secret: Boolean(process.env.JSCORE_WEBHOOK_SECRET), time: new Date().toISOString() });
}
