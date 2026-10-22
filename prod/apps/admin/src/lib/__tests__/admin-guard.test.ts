import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_ROLES, ROLES, canAssignRole, guardAdmin, isAdminRole } from '@jscore/contracts';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined), getAll: () => [], set: () => undefined }) }));

const { getAdminContext } = await import('../admin-ctx');
const { requireAdmin, isResponse } = await import('../route');
const { scopesFor, inviteSchema, patchSchema } = await import('../users');
const { sanitizePatch, diffSettings } = await import('../settings');

describe('guardAdmin (saf)', () => {
  const M = (role: string, org = 'o1', status?: string) => ({ org_id: org, role, status });
  it('yalnızca owner / org_admin geçer', () => {
    expect(ADMIN_ROLES).toEqual(['owner', 'org_admin']);
    for (const r of ROLES) expect(isAdminRole(r)).toBe(r === 'owner' || r === 'org_admin');
    for (const r of ROLES) {
      const g = guardAdmin('u1', [M(r)]);
      expect(g.ok).toBe(r === 'owner' || r === 'org_admin');
      if (!g.ok) expect(g.reason).toBe('forbidden');
    }
  });
  it('oturum yok / üyelik yok / devre dışı', () => {
    expect(guardAdmin(null, [M('owner')])).toEqual({ ok: false, reason: 'no_session' });
    expect(guardAdmin('u1', [])).toEqual({ ok: false, reason: 'no_membership' });
    expect(guardAdmin('u1', [M('owner', 'o1', 'disabled')])).toEqual({ ok: false, reason: 'disabled' });
  });
  it('devre dışı yönetici üyelik yetki vermez; aktif olan seçilir', () => {
    expect(guardAdmin('u1', [M('owner', 'o1', 'disabled'), M('creative', 'o2')])).toEqual({ ok: false, reason: 'forbidden' });
    expect(guardAdmin('u1', [M('owner', 'o1', 'disabled'), M('org_admin', 'o2')])).toEqual({ ok: true, orgId: 'o2', role: 'org_admin' });
  });
  it('tercih edilen org yalnızca orada yöneticiyse kullanılır', () => {
    const ms = [M('owner', 'o1'), M('org_admin', 'o2'), M('creative', 'o3')];
    expect(guardAdmin('u', ms, 'o2')).toMatchObject({ ok: true, orgId: 'o2' });
    expect(guardAdmin('u', ms, 'o3')).toMatchObject({ ok: true, orgId: 'o1' });
  });
  it('org_admin owner rolüne dokunamaz', () => {
    expect(canAssignRole('owner', 'owner')).toBe(true);
    expect(canAssignRole('org_admin', 'owner')).toBe(false);
    expect(canAssignRole('org_admin', 'creative')).toBe(true);
  });
});

describe('getAdminContext / requireAdmin (demo modu)', () => {
  beforeEach(() => { jar.clear(); delete process.env.NEXT_PUBLIC_SUPABASE_URL; });
  it('çerez yok → oturum yok → 401', async () => {
    expect(await getAdminContext()).toEqual({ ok: false, reason: 'no_session' });
    const r = await requireAdmin();
    expect(isResponse(r) && r.status).toBe(401);
  });
  it('owner girer', async () => {
    jar.set('jsdemo_account', 'owner');
    const r = await getAdminContext();
    expect(r.ok && r.ctx.role).toBe('owner');
    expect(isResponse(await requireAdmin())).toBe(false);
  });
  it.each(['account', 'creative', 'finance', 'hr', 'payroll', 'client_admin', 'client_viewer'])('%s → 403 Yetkiniz yok', async (acc) => {
    jar.set('jsdemo_account', acc);
    expect(await getAdminContext()).toEqual({ ok: false, reason: 'forbidden' });
    const r = await requireAdmin();
    expect(isResponse(r) && r.status).toBe(403);
    expect(isResponse(r) && ((await r.json()) as { error: string }).error).toMatch(/Yetkiniz yok/);
  });
});

describe('kullanıcı yönetimi doğrulamaları', () => {
  it('müşteri rolleri müşteri kapsamı ister', () => {
    expect(scopesFor('client_admin', {}).error).toBeTruthy();
    expect(scopesFor('client_viewer', { client_ids: ['a'] }).scopes).toEqual({ client_ids: ['a'] });
    expect(scopesFor('creative', {}).error).toBeUndefined();
  });
  it('davet/yama şemaları', () => {
    expect(inviteSchema.safeParse({ email: ' A@B.com ', role: 'pm' }).data?.email).toBe('a@b.com');
    expect(inviteSchema.safeParse({ email: 'x', role: 'pm' }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: 'a@b.com', role: 'god' }).success).toBe(false);
    expect(patchSchema.safeParse({ status: 'banned' }).success).toBe(false);
    expect(patchSchema.safeParse({ status: 'disabled', employee_id: null }).success).toBe(true);
  });
});

describe('ayar kaydı', () => {
  it('ALWAYS_ON modül bayrakları atılır, alan adları normalize edilir', () => {
    const p = sanitizePatch({ feature_flags: { crm: false, overview: false, board: false }, security: { mfa_required: false, session_hours: 12, ip_allowlist: [], allowed_email_domains: [' @A.com', 'a.com'] } });
    expect(p.feature_flags).toEqual({ crm: false });
    expect(p.security?.allowed_email_domains).toEqual(['a.com']);
  });
  it('fark denetime yazılacak biçimde çıkar', () => {
    const base = sanitizePatch({}) as never;
    void base;
    const a = { feature_flags: { crm: true }, feature_toggles: {} } as never;
    const b = { feature_flags: { crm: false }, feature_toggles: { 'tasks.bids': false } } as never;
    const d = diffSettings(a, b);
    expect(d.feature_flags).toEqual({ crm: false });
    expect(d.feature_toggles).toEqual({ 'tasks.bids': false });
    expect(d.changed).toEqual(expect.arrayContaining(['feature_flags', 'feature_toggles']));
  });
});
