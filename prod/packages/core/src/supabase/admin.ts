import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../env';

/** RLS'i aşar — yalnızca sunucu (webhook, MCP token doğrulama, agent_runs yazma). */
export function createAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
