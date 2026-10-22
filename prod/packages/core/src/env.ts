/** Supabase bağlı mı? (NEXT_PUBLIC_* build zamanında satır içi yazılır; client + server aynı sonucu verir.) */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON);
export const DEMO_COOKIE = 'jsdemo_account';
export const ORG_COOKIE = 'js_org';

/** Supabase modunda org cookie'si UUID olmalı; demo modundan kalan 'org_jobs' gibi değerler yok sayılır. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validOrgId = (v: string | null | undefined): string | null => (v && (!isSupabaseConfigured() || UUID_RE.test(v)) ? v : null);
