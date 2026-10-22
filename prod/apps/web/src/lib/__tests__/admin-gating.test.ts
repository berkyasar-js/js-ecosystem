import { describe, expect, it } from 'vitest';
import {
  ADMIN_ONLY_MODULES, ALWAYS_ON_MODULES, FEATURES, MODULES, agentFeatureKey, checkTokenPolicy, emailDomainAllowed, featureEnabled, featuresOf, moduleEntitled, normalizeDomains, tabEnabled, orgSettingsSchema,
} from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { navModules, routeVerdict } from '../nav';
import { mfaRequired, mfaStep } from '../mfa';
import { loginDomainAllowed } from '../auth-domain';

describe('modül bayrakları', () => {
  it('kapalı modül menüden düşer; ALWAYS_ON asla düşmez', () => {
    const ids = (flags: Record<string, boolean>) => navModules('owner', flags).map((m) => m.id);
    expect(ids({ crm: false })).not.toContain('crm');
    expect(ids({ mywork: false })).not.toContain('mywork'); // ürün paketi yok → modül kimliği anahtar
    expect(ids({ overview: false, profile: false, approvals: false })).toEqual(expect.arrayContaining(['overview', 'profile', 'approvals']));
    for (const id of ALWAYS_ON_MODULES) expect(moduleEntitled(id, { [id]: false })).toBe(true);
  });
  it('yönetim modülleri kullanıcı menüsünde yok', () => {
    const ids = navModules('owner', {}).map((m) => m.id);
    for (const id of ADMIN_ONLY_MODULES) expect(ids).not.toContain(id);
    expect(ids).toContain('projects');
  });
  it('rota kararı: yönetim modülü → moved, kapalı modül → disabled, diğer → ok', () => {
    expect(routeVerdict('/app/board', {})).toBe('moved');
    expect(routeVerdict('/app/connect', {})).toBe('moved'); // integrations modülünün slug'ı connect
    expect(routeVerdict('/app/admin', {})).toBe('moved');
    expect(routeVerdict('/app/automations', {})).toBe('moved');
    expect(routeVerdict('/app/finance', { finance: false })).toBe('disabled');
    expect(routeVerdict('/app/finance/anything', { finance: false })).toBe('disabled');
    expect(routeVerdict('/app/finance', {})).toBe('ok');
    expect(routeVerdict('/app/overview', { overview: false })).toBe('ok');
    expect(routeVerdict('/app/profile', undefined)).toBe('ok');
  });
});

describe('özellik anahtarları', () => {
  it('yoksa açık, yalnızca false kapatır', () => {
    expect(featureEnabled(undefined, 'tasks.bids')).toBe(true);
    expect(featureEnabled({}, 'tasks.bids')).toBe(true);
    expect(featureEnabled({ 'tasks.bids': true }, 'tasks.bids')).toBe(true);
    expect(featureEnabled({ 'tasks.bids': false }, 'tasks.bids')).toBe(false);
    expect(featureEnabled({ 'tasks.bids': false }, 'tasks.files')).toBe(true);
  });
  it('kayıt tutarlı: benzersiz anahtar, gerçek modül, <modül>.<özellik> biçimi', () => {
    const ids = new Set(MODULES.map((m) => m.id));
    expect(new Set(FEATURES.map((f) => f.key)).size).toBe(FEATURES.length);
    for (const f of FEATURES) { expect(ids.has(f.module)).toBe(true); expect(f.key.startsWith(`${f.module}.`)).toBe(true); }
    expect(featuresOf('tasks').map((f) => f.key)).toEqual(expect.arrayContaining(['tasks.bids', 'tasks.board_view', 'tasks.comments', 'tasks.checklists', 'tasks.files', 'tasks.trello_sync']));
  });
  it('sekme bağlı özellik kapalıysa sekme gizlenir', () => {
    expect(tabEnabled({ 'finance.invoices': false }, 'finance', 'invoices')).toBe(false);
    expect(tabEnabled({ 'finance.invoices': false }, 'finance', 'budgets')).toBe(true);
    expect(tabEnabled({ 'studio.ai_drafts': false }, 'studio', 'composer')).toBe(false);
    expect(tabEnabled({}, 'studio', 'composer')).toBe(true);
    expect(tabEnabled({ 'finance.invoices': false }, 'people', 'invoices')).toBe(true);
  });
  it('AI özellikleri ajana bağlı (sunucu uygulaması)', () => {
    expect(agentFeatureKey('inbox_drafts')).toBe('inbox.ai_drafts');
    expect(agentFeatureKey('studio_draft')).toBe('studio.ai_drafts');
    expect(agentFeatureKey('twin_bid')).toBe('tasks.bids');
    expect(agentFeatureKey('chair')).toBeNull();
  });
  it('ayar şeması yeni anahtarları kabul eder', () => {
    const base = { general: { name: 'X' }, notifications: { rules: [] }, structure: { flow_stages: [], work_hours: '09:00-18:00' }, ai: { monthly_cap_usd: 0, default_model: 'm', board_enabled: false }, security: { mfa_required: false, session_hours: 12, ip_allowlist: [] } };
    const r = orgSettingsSchema.parse({ ...base, feature_toggles: { 'tasks.bids': false }, security: { ...base.security, require_mfa: true, allowed_email_domains: ['a.com'], token_max_days: 90 } });
    expect(r.feature_toggles?.['tasks.bids']).toBe(false);
    expect(r.security.require_mfa).toBe(true);
  });
});

describe('giriş güvenliği', () => {
  it('MFA adımı AAL durumundan türer', () => {
    expect(mfaStep('aal2', 'aal2')).toBe('ok');
    expect(mfaStep('aal1', 'aal2')).toBe('challenge');
    expect(mfaStep('aal1', 'aal1')).toBe('enroll');
    expect(mfaStep(undefined, undefined)).toBe('enroll');
    expect(mfaRequired('supabase', true)).toBe(true);
    expect(mfaRequired('supabase', false)).toBe(false);
    expect(mfaRequired('demo', true)).toBe(false);
  });
  it('e-posta alan adı kısıtı', () => {
    expect(emailDomainAllowed('a@x.com', undefined)).toBe(true);
    expect(emailDomainAllowed('a@x.com', [])).toBe(true);
    expect(emailDomainAllowed('A@X.com', ['x.com'])).toBe(true);
    expect(emailDomainAllowed('a@y.com', ['x.com'])).toBe(false);
    expect(emailDomainAllowed('a@sub.x.com', ['x.com'])).toBe(false);
    expect(emailDomainAllowed('', ['x.com'])).toBe(false);
    expect(emailDomainAllowed('a@x.com', ['@X.com '])).toBe(true);
    expect(normalizeDomains([' @A.com', 'a.com', ''])).toEqual(['a.com']);
  });
  it('callback kontrolü: org listelerinden biri izin veriyorsa geçer, üyelik yoksa serbest', async () => {
    const fake = (mem: Array<{ org_id: string }>, orgs: Array<{ settings: unknown }>) => ({
      from: (t: string) => ({
        select: () => (t === 'memberships' ? { eq: () => ({ eq: async () => ({ data: mem }) }) } : { in: async () => ({ data: orgs }) }),
      }),
    }) as never;
    expect(await loginDomainAllowed(null, 'u', 'a@x.com')).toBe(true);
    expect(await loginDomainAllowed(fake([], []), 'u', 'a@x.com')).toBe(true);
    expect(await loginDomainAllowed(fake([{ org_id: 'o' }], [{ settings: { security: { allowed_email_domains: ['y.com'] } } }]), 'u', 'a@x.com')).toBe(false);
    expect(await loginDomainAllowed(fake([{ org_id: 'o' }], [{ settings: { security: { allowed_email_domains: ['x.com'] } } }]), 'u', 'a@x.com')).toBe(true);
    expect(await loginDomainAllowed(fake([{ org_id: 'o' }, { org_id: 'p' }], [{ settings: { security: { allowed_email_domains: ['y.com'] } } }, { settings: {} }]), 'u', 'a@x.com')).toBe(true);
  });
});

describe('API anahtarı politikası', () => {
  it('ömür ve kapsam sınırı', () => {
    expect(checkTokenPolicy(undefined, { scopes: ['mcp'], expires_in_days: null })).toBeNull();
    expect(checkTokenPolicy({ token_max_days: 90 }, { scopes: ['mcp'], expires_in_days: null })).toMatch(/90 gün/);
    expect(checkTokenPolicy({ token_max_days: 90 }, { scopes: ['mcp'], expires_in_days: 365 })).toMatch(/90 gün/);
    expect(checkTokenPolicy({ token_max_days: 90 }, { scopes: ['mcp'], expires_in_days: 30 })).toBeNull();
    expect(checkTokenPolicy({ token_allowed_scopes: ['mcp'] }, { scopes: ['mcp', 'webhooks'], expires_in_days: 30 })).toMatch(/webhooks/);
    expect(checkTokenPolicy({ token_allowed_scopes: [] }, { scopes: ['webhooks'], expires_in_days: 30 })).toBeNull();
  });
  it('DemoRepo.createToken politikayı uygular', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    await repo.saveSettings({ security: { mfa_required: false, session_hours: 12, ip_allowlist: [], token_max_days: 30 } });
    await expect(repo.createToken({ name: 'uzun', scopes: ['mcp'], expires_in_days: 365 })).rejects.toThrow(/30 gün/);
    await expect(repo.createToken({ name: 'süresiz', scopes: ['mcp'], expires_in_days: null })).rejects.toThrow(/30 gün/);
    const ok = await repo.createToken({ name: 'kısa', scopes: ['mcp'], expires_in_days: 7 });
    expect(ok.plaintext.length).toBeGreaterThan(20);
  });
  it('DemoRepo ayarları yeni anahtarları saklar', async () => {
    const repo = new DemoRepo({ accountId: 'owner' });
    await repo.saveSettings({ feature_toggles: { 'tasks.bids': false }, feature_flags: { crm: false } });
    const s = await repo.getSettings();
    expect(featureEnabled(s.feature_toggles, 'tasks.bids')).toBe(false);
    expect(navModules('owner', s.feature_flags).some((m) => m.id === 'crm')).toBe(false);
  });
});
