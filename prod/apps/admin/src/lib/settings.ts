import type { SupabaseClient } from '@supabase/supabase-js';
import { ALWAYS_ON_MODULES, orgSettingsPatchSchema, type OrgSettings } from '@jscore/contracts';
import { DEFAULT_SETTINGS } from '@jscore/core/repo/defaults';

export async function readSettings(sb: SupabaseClient, orgId: string): Promise<{ settings: OrgSettings; name: string; slug: string }> {
  const { data, error } = await sb.from('organizations').select('name,slug,settings').eq('id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  const s = ((data?.settings ?? {}) as Partial<OrgSettings>);
  const name = (data?.name as string) ?? DEFAULT_SETTINGS.general.name;
  return { settings: { ...DEFAULT_SETTINGS, ...s, general: { ...DEFAULT_SETTINGS.general, name, ...s.general }, security: { ...DEFAULT_SETTINGS.security, ...s.security } }, name, slug: (data?.slug as string) ?? '' };
}

/** Kaydedilmeden önce temizler: ALWAYS_ON modül anahtarlarını düşürür, alan adlarını normalize eder. */
export function sanitizePatch(patch: Partial<OrgSettings>): Partial<OrgSettings> {
  const p = orgSettingsPatchSchema.parse(patch);
  if (p.feature_flags) p.feature_flags = Object.fromEntries(Object.entries(p.feature_flags).filter(([k]) => !(ALWAYS_ON_MODULES as readonly string[]).includes(k)));
  if (p.security?.allowed_email_domains) p.security = { ...p.security, allowed_email_domains: Array.from(new Set(p.security.allowed_email_domains.map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))) };
  return p;
}

/** Değişen üst düzey anahtarlar + bayrak farkları (denetim kaydı için). */
export function diffSettings(before: OrgSettings, after: OrgSettings) {
  const changed: string[] = [];
  for (const k of Object.keys(after) as Array<keyof OrgSettings>) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  const flagDiff = (a: Record<string, boolean> | undefined, b: Record<string, boolean> | undefined) => {
    const out: Record<string, boolean> = {};
    for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) if ((a?.[k] ?? true) !== (b?.[k] ?? true)) out[k] = b?.[k] ?? true;
    return out;
  };
  return { changed, feature_flags: flagDiff(before.feature_flags, after.feature_flags), feature_toggles: flagDiff(before.feature_toggles, after.feature_toggles) };
}
