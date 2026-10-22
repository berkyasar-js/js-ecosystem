export type MfaStep = 'ok' | 'challenge' | 'enroll';
/**
 * Supabase AAL durumundan MFA adımı. current=aal2 → tamam; next=aal2 (doğrulanmış faktör var, bu oturum aal1) → kod sor; aksi → TOTP kaydı.
 */
export const mfaStep = (current: string | null | undefined, next: string | null | undefined): MfaStep => (current === 'aal2' ? 'ok' : next === 'aal2' ? 'challenge' : 'enroll');

/** Zorunluluk yalnızca Supabase modunda ve org ayarı açıkken geçerlidir. */
export const mfaRequired = (mode: 'demo' | 'supabase', requireMfa: boolean) => mode === 'supabase' && requireMfa;
