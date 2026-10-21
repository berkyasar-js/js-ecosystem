export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/** Supabase env yoksa uygulama DEMO modunda çalışır (bellekte, tek örnek proje). */
export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON);
export const AI_MODEL = 'claude-sonnet-5-5';
