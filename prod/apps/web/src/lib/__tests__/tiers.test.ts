import { describe, expect, it } from 'vitest';
import { accessTier, agentScope, departmentOf, reportsOf, supervisedEmployees, supervises, type TierPerson } from '@jscore/contracts';

// BY (owner) → UC (kreatif lider) → SK, AD ; BY → OE (hesap lideri) → MK ; ZZ ayrılmış ; FR freelancer
const team: TierPerson[] = [
  { id: 'BY', team: 'Yönetim', manager_id: null },
  { id: 'UC', team: 'Kreatif', manager_id: 'BY' },
  { id: 'SK', team: 'Kreatif', manager_id: 'UC' },
  { id: 'AD', team: 'Kreatif', manager_id: 'SK' },
  { id: 'OE', team: 'Hesap', manager_id: 'BY' },
  { id: 'MK', team: 'Hesap', manager_id: 'OE' },
  { id: 'ZZ', team: 'Hesap', manager_id: 'OE', status: 'left' },
  { id: 'FR', team: null, manager_id: null },
];

describe('Erişim katmanları (4 katman)', () => {
  it('katman: sahip / lider / üye / dış', () => {
    expect(accessTier({ role: 'owner', employee_id: 'BY' }, team)).toBe('super_admin');
    expect(accessTier({ role: 'org_admin' }, team)).toBe('super_admin');
    expect(accessTier({ role: 'creative', employee_id: 'UC' }, team)).toBe('department_lead');
    expect(accessTier({ role: 'creative', employee_id: 'AD' }, team)).toBe('member');
    expect(accessTier({ role: 'pm' }, team)).toBe('member');
    expect(accessTier({ role: 'freelancer', employee_id: 'FR' }, team)).toBe('external');
    expect(accessTier({ role: 'client_admin' }, team)).toBe('external');
  });
  it('bağlı zincir dolaylıdır, ayrılanı saymaz, döngüde takılmaz', () => {
    expect(reportsOf('UC', team).sort()).toEqual(['AD', 'SK']);
    expect(reportsOf('OE', team)).toEqual(['MK']);
    const loop: TierPerson[] = [{ id: 'A', manager_id: 'B' }, { id: 'B', manager_id: 'A' }];
    expect(reportsOf('A', loop)).toEqual(['B']);
  });
  it('denetim: lider yalnızca kendi zincirini, üye yalnızca kendini görür', () => {
    const uc = { role: 'creative' as const, employee_id: 'UC' };
    expect(supervises(uc, 'AD', team)).toBe(true);
    expect(supervises(uc, 'MK', team)).toBe(false);
    expect(supervises(uc, 'UC', team)).toBe(true);
    const ad = { role: 'creative' as const, employee_id: 'AD' };
    expect(supervises(ad, 'AD', team)).toBe(true);
    expect(supervises(ad, 'SK', team)).toBe(false);
    expect(supervises({ role: 'owner' }, 'MK', team)).toBe(true);
    expect(supervises({ role: 'freelancer', employee_id: 'FR' }, 'FR', team)).toBe(false);
    expect(supervisedEmployees(uc, team).sort()).toEqual(['AD', 'SK', 'UC']);
    expect(supervisedEmployees({ role: 'account', employee_id: 'OE' }, team).sort()).toEqual(['MK', 'OE']);
  });
  it('departman ve ajan kapsamı sahibinden geniş olamaz', () => {
    expect(departmentOf('SK', team)).toBe('Kreatif');
    expect(departmentOf('FR', team)).toBeNull();
    expect(departmentOf(null, team)).toBeNull();
    expect(agentScope(['b1', 'b2'])).toEqual(['b1', 'b2']);
    expect(agentScope(['b1', 'b2'], ['b2', 'b9'])).toEqual(['b2']);
    expect(agentScope([], ['b9'])).toEqual(['b9']);
  });
});
