import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ROLES, canAssignRole, isClientRole, type Role } from '@jscore/contracts';
import { z } from 'zod';

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
export const appCallback = (next = '/app/overview') => (APP_URL ? `${APP_URL}/auth/callback?next=${encodeURIComponent(next)}` : undefined);

/** auth.users sayfalı okuma (servis rolü). Üst sınır 10 sayfa × 1000. */
export async function listAllUsers(sb: SupabaseClient): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    out.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return out;
}
export async function findUserByEmail(sb: SupabaseClient, email: string): Promise<User | null> {
  const e = email.trim().toLowerCase();
  return (await listAllUsers(sb)).find((u) => u.email?.toLowerCase() === e) ?? null;
}

export const roleSchema = z.enum(ROLES);
export const scopesInput = z.object({ client_ids: z.array(z.string().uuid()).max(50).optional(), brand_ids: z.array(z.string().uuid()).max(200).optional() });
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(), role: roleSchema, employee_id: z.string().uuid().nullable().optional(),
  client_ids: z.array(z.string().uuid()).max(50).optional(), brand_ids: z.array(z.string().uuid()).max(200).optional(),
});
export const patchSchema = z.object({
  role: roleSchema.optional(), employee_id: z.string().uuid().nullable().optional(),
  client_ids: z.array(z.string().uuid()).max(50).optional(), brand_ids: z.array(z.string().uuid()).max(200).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
/** Müşteri rolleri en az bir müşteri kapsamı ister. */
export function scopesFor(role: Role, input: { client_ids?: string[]; brand_ids?: string[] }): { scopes: Record<string, string[]>; error?: string } {
  const scopes: Record<string, string[]> = {};
  if (input.client_ids?.length) scopes.client_ids = input.client_ids;
  if (input.brand_ids?.length) scopes.brand_ids = input.brand_ids;
  if (isClientRole(role) && !scopes.client_ids) return { scopes, error: 'Müşteri rolleri için en az bir müşteri kapsamı seçilmeli' };
  return { scopes };
}
export { canAssignRole };

/** Son aktif owner'ı koruma: owner sayısı bu işlemle 0'a düşecekse true. */
export async function wouldRemoveLastOwner(sb: SupabaseClient, orgId: string, userId: string): Promise<boolean> {
  const { data } = await sb.from('memberships').select('user_id').eq('org_id', orgId).eq('role', 'owner').eq('status', 'active');
  const owners = (data ?? []).map((r) => r.user_id as string);
  return owners.includes(userId) && owners.length <= 1;
}
export const BAN_FOREVER = '876000h';
