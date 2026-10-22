import type { SupabaseClient } from '@supabase/supabase-js';
import { emailDomainAllowed } from '@jscore/contracts';

/**
 * Google ile girişte e-posta alan adı kısıtı. Kullanıcının aktif üyelikli organizasyonlarından HERHANGİ BİRİ (liste boş = serbest)
 * alan adına izin veriyorsa geçer; üyelik yoksa (henüz davet edilmemiş) kısıt uygulanmaz. Servis rolü yoksa kontrol edilemez → izin.
 */
export async function loginDomainAllowed(admin: SupabaseClient | null, userId: string, email: string | undefined): Promise<boolean> {
  if (!admin) return true;
  const { data: mem } = await admin.from('memberships').select('org_id').eq('user_id', userId).eq('status', 'active');
  const orgs = (mem ?? []).map((m) => m.org_id as string);
  if (!orgs.length) return true;
  const { data: rows } = await admin.from('organizations').select('settings').in('id', orgs);
  return (rows ?? []).some((r) => emailDomainAllowed(email, ((r.settings as { security?: { allowed_email_domains?: string[] } } | null)?.security?.allowed_email_domains)));
}
