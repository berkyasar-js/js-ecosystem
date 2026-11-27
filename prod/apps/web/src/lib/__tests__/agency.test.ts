import { describe, expect, it } from 'vitest';
import { MODULES, NAV_GROUPS, canAccessModule } from '@jscore/contracts';
import {
  AGENCY_ROSTER, DIVISIONS, PERSONAS, RECENT_WINDOW_MS, agencyActivity, personaById, personaFor, personaForRun, agencyAgentId, demoAgencyOutput, searchRoster, toAgencyRun,
} from '@jscore/agents';
import { officeLayout } from '@jscore/office-ui/layout';
import { agencyPrompt, agencySystemPrompt } from '@jscore/agents/server';

const run = (slug: string, created_at: string, project_id: string | null = 'p1', status = 'ok') =>
  toAgencyRun({ id: `${slug}-${created_at}`, agent: agencyAgentId(slug), input: { project_id, brief: 'iş', by: 'BY' }, output: { text: 'çıktı' }, status, created_at, cost_usd: '0.01' })!;

describe('Ajans Ofisi — kadro', () => {
  it('283 rol, benzersiz slug, hepsi tanımlı bir bölümde ve promptu var', () => {
    expect(AGENCY_ROSTER).toHaveLength(283);
    expect(new Set(AGENCY_ROSTER.map((r) => r.slug)).size).toBe(283);
    const ids = new Set(DIVISIONS.map((d) => d.id));
    for (const r of AGENCY_ROSTER) {
      expect(ids.has(r.division), r.slug).toBe(true);
      expect(r.name.length, r.slug).toBeGreaterThan(1);
      expect((agencyPrompt(r.slug) ?? '').length, r.slug).toBeGreaterThan(200);
    }
    expect(agencyPrompt('yok-boyle-rol')).toBeNull();
  });
  it('arama ad / açıklama / bölüm etiketinde çalışır', () => {
    expect(searchRoster('reality checker', null).map((r) => r.slug)).toContain('testing-reality-checker');
    expect(searchRoster('', 'research')).toHaveLength(1);
    expect(searchRoster('güvenlik', null).length).toBeGreaterThanOrEqual(12);
    expect(searchRoster('zzzz-yok', null)).toHaveLength(0);
  });
});

describe('Ajans Ofisi — yerleşim', () => {
  const layout = officeLayout(AGENCY_ROSTER);
  it('her role bir masa, bölüm başına bir oda', () => {
    expect(layout.rooms).toHaveLength(DIVISIONS.length);
    const seats = layout.rooms.flatMap((r) => r.seats);
    expect(seats).toHaveLength(283);
    expect(new Set(seats.map((s) => s.slug)).size).toBe(283);
  });
  it('masalar kendi odasının içinde, odalar çakışmıyor, masalar üst üste değil', () => {
    for (const r of layout.rooms) for (const s of r.seats) {
      expect(s.x).toBeGreaterThan(r.x); expect(s.x).toBeLessThan(r.x + r.w);
      expect(s.z).toBeGreaterThan(r.z); expect(s.z).toBeLessThan(r.z + r.d);
    }
    for (const a of layout.rooms) for (const b of layout.rooms) {
      if (a === b) continue;
      const apart = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.z + a.d <= b.z + 1e-9 || b.z + b.d <= a.z + 1e-9;
      expect(apart, `${a.division} × ${b.division}`).toBe(true);
    }
    const keys = layout.rooms.flatMap((r) => r.seats.map((s) => `${s.x.toFixed(2)}:${s.z.toFixed(2)}`));
    expect(new Set(keys).size).toBe(283);
  });
  it('deterministik', () => { expect(officeLayout(AGENCY_ROSTER)).toEqual(layout); });
});

describe('Ajans Ofisi — etkinlik', () => {
  const now = Date.parse('2026-12-01T12:00:00Z');
  it('agent_runs satırını çözer; Agency dışı ajanı yok sayar', () => {
    const v = run('testing-reality-checker', '2026-12-01T11:00:00Z');
    expect(v).toMatchObject({ slug: 'testing-reality-checker', project_id: 'p1', brief: 'iş', by: 'BY', text: 'çıktı', status: 'ok', cost_usd: 0.01 });
    expect(toAgencyRun({ id: 'x', agent: 'chair', input: {}, output: {}, status: 'ok', created_at: '2026-12-01T11:00:00Z' })).toBeNull();
    expect(toAgencyRun({ id: 'x', agent: agencyAgentId('a'), input: null, output: 'bozuk', status: 'tuhaf', created_at: '2026-12-01T11:00:00Z' })).toMatchObject({ project_id: null, text: '', status: 'demo' });
  });
  it('çalışıyor > son 24 sa > boşta; proje süzgeci ve sayım', () => {
    const runs = [
      run('a', '2026-12-01T11:00:00Z'), run('a', '2026-11-30T09:00:00Z'), run('b', '2026-11-20T09:00:00Z'), run('c', '2026-12-01T10:00:00Z', 'p2'),
    ];
    const act = agencyActivity(runs, now, ['d', 'b']);
    expect(act.get('a')).toMatchObject({ state: 'recent', count: 2 });
    expect(act.get('a')!.last!.created_at).toBe('2026-12-01T11:00:00Z');
    expect(act.get('b')).toMatchObject({ state: 'working', count: 1 });
    expect(act.get('d')).toMatchObject({ state: 'working', count: 0, last: null });
    expect(act.get('c')!.state).toBe('recent');
    const scoped = agencyActivity(runs, now, [], 'p2');
    expect([...scoped.keys()]).toEqual(['c']);
    const edge = agencyActivity([run('e', new Date(now - RECENT_WINDOW_MS - 1000).toISOString())], now);
    expect(edge.get('e')!.state).toBe('idle');
  });
});

describe('Ajans Ofisi — çıktı ve katalog', () => {
  it('demo çıktısı model çağrısı yapılmadığını söyler', () => {
    const role = AGENCY_ROSTER[0];
    const out = demoAgencyOutput(role, '  üç   metin yaz ', 'Lansman');
    expect(out).toContain('gerçek model çağrısı yapılmadı');
    expect(out).toContain('Proje: Lansman');
    expect(out).toContain('Görev: üç metin yaz');
  });
  it('sistem promptu araç erişimi olmadığını ve bağlamı ekler', () => {
    const s = agencySystemPrompt('ROL', { project: 'Lansman', task: 'Metin' });
    expect(s.startsWith('ROL')).toBe(true);
    expect(s).toContain('Proje: Lansman · Görev: Metin');
    expect(s).toContain('yalnızca metin üret');
  });
  it('modül kataloğunda ve Ekip grubunda; müşteri rolleri erişemez', () => {
    expect(MODULES.find((m) => m.id === 'agency')).toMatchObject({ slug: 'agency', live: true });
    expect(NAV_GROUPS.find((g) => g.id === 'team')!.children.some((c) => c.href === '/app/agency')).toBe(true);
    expect(canAccessModule('owner', 'agency')).toBe(true);
    expect(canAccessModule('pm', 'agency')).toBe(true);
    expect(canAccessModule('client_admin', 'agency')).toBe(false);
    expect(canAccessModule('freelancer', 'agency')).toBe(false);
  });
});

describe('Ajans Ofisi — tiplemeler', () => {
  it('12 tipleme, benzersiz kimlik, her bölüm tam bir tiplemede, görseller yerinde', async () => {
    const { existsSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    expect(PERSONAS).toHaveLength(12);
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(12);
    for (const d of DIVISIONS) expect(PERSONAS.filter((p) => p.divisions.includes(d.id)), d.id).toHaveLength(1);
    for (const p of PERSONAS) expect(existsSync(fileURLToPath(new URL(`../../../public${p.image}`, import.meta.url))), p.image).toBe(true);
  });
  it('her rolün deterministik bir tiplemesi var; 12 tiplemenin hepsi kullanılıyor', () => {
    const used = new Set(AGENCY_ROSTER.map((r) => personaFor(r).id));
    expect(used.size).toBe(12);
    expect(personaFor({ slug: 'testing-reality-checker', division: 'testing' }).id).toBe('quality');
    expect(personaFor({ slug: 'chief-financial-officer', division: 'specialized' }).id).toBe('finance');
    expect(personaFor({ slug: 'customer-service', division: 'specialized' }).id).toBe('operations');
    expect(personaFor({ slug: 'x', division: 'bilinmeyen' }).id).toBe('operations');
  });
  it('elle seçim geçerliyse onu, değilse varsayılanı kullanır; çalıştırma satırından okunur', () => {
    const role = { slug: 'testing-reality-checker', division: 'testing' };
    expect(personaForRun(role, 'sales').id).toBe('sales');
    expect(personaForRun(role, 'yok').id).toBe('quality');
    expect(personaForRun(role, null).id).toBe('quality');
    expect(personaById('yok')).toBeUndefined();
    const v = toAgencyRun({ id: 'x', agent: agencyAgentId(role.slug), input: { persona: 'creative' }, output: {}, status: 'ok', created_at: '2026-12-01T11:00:00Z' })!;
    expect(v.persona).toBe('creative');
    expect(run('a', '2026-12-01T11:00:00Z').persona).toBeNull();
  });
});
