/** Supabase bağlı mı? (NEXT_PUBLIC_* build zamanında satır içi yazılır; client + server aynı sonucu verir.) */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON);
export const DEMO_COOKIE = 'jsdemo_account';
export const ORG_COOKIE = 'js_org';
