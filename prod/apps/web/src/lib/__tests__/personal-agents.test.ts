import { describe, expect, it } from 'vitest';
import {
  MODULES, activeVersion, agentDigestLines, agentVersionSchema, canAccessModule, lineDiff, nextVersionNumber, pendingDrafts, personalAgentPrompt, versionLabel, versionText, versionTransitionAllowed,
} from '@jscore/contracts';
import { DemoRepo } from '@jscore/core/repo/demo';
import { ForbiddenError } from '@jscore/core/repo/types';
import { approveVersion, listManagedAgents, proposeVersion, rejectVersion, rollbackTo } from '@jscore/core/personal-agents';

const T = '2026-10-14T10:00:00Z';
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };
const draft = (text: string) => ({ instructions: text, can: ['Taslak üretir'], cannot: ['Bütçe onaylayamaz'], change_note: 'ilk' });

describe('kişisel ajanlar — saf kurallar', () => {
  it('sürüm geçişleri: taslak → yürürlükte | reddedildi; yürürlükte → eski; gerisi kapalı', () => {
    expect(versionTransitionAllowed('draft', 'active')).toBe(true);
    expect(versionTransitionAllowed('draft', 'rejected')).toBe(true);
    expect(versionTransitionAllowed('active', 'superseded')).toBe(true);
    expect(versionTransitionAllowed('superseded', 'active')).toBe(false);
    expect(versionTransitionAllowed('rejected', 'active')).toBe(false);
    expect(versionTransitionAllowed('active', 'draft')).toBe(false);
  });
  it('satır farkı eklenen ve silinen satırları ayırır', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([{ kind: 'same', text: 'a' }, { kind: 'del', text: 'b' }, { kind: 'add', text: 'x' }, { kind: 'same', text: 'c' }]);
    expect(lineDiff('a', 'a').every((l) => l.kind === 'same')).toBe(true);
    expect(lineDiff('', 'yeni').filter((l) => l.kind === 'add')).toHaveLength(1);
  });
  it('sistem talimatı: rol gövdesi (varsa), talimat, kapsam ve sabit sınırlar', () => {
    const p = personalAgentPrompt({ name: 'Meta Ads Ajanı', specialty: 'Reklam optimizasyonu', ownerName: 'Seda', basePrompt: 'ROL GÖVDESİ', version: { version: 3, instructions: 'Önce veriyi oku.', can: ['Metin önerir'], cannot: ['Bütçe onaylayamaz'] } });
    expect(p.startsWith('ROL GÖVDESİ')).toBe(true);
    expect(p).toContain('Seda adına'); expect(p).toContain('talimat v3'); expect(p).toContain('- Bütçe onaylayamaz'); expect(p).toContain('yalnızca metin üretirsin');
    expect(personalAgentPrompt({ name: 'A', specialty: '', ownerName: 'S', basePrompt: null, version: { version: 1, instructions: 'x', can: [], cannot: [] } })).toContain('- (tanımlı değil)');
    expect(versionText({ instructions: 'x', can: ['a'], cannot: ['b'] })).toContain('+ a');
    expect(versionLabel(0)).toBe('sürüm yok');
  });
  it('günlük özet en çok 3 madde; hiçbir şey olmadıysa boş', () => {
    expect(agentDigestLines([{ agentName: 'A', runs: 0, approved: 0, pending: 0, proposedByAgent: 0 }])).toEqual([]);
    const l = agentDigestLines([{ agentName: 'A', runs: 4, approved: 1, pending: 2, proposedByAgent: 1 }, { agentName: 'B', runs: 1, approved: 0, pending: 0, proposedByAgent: 0 }]);
    expect(l).toHaveLength(3); expect(l[0]).toContain('5 görev'); expect(l[0]).toContain('A, 4'); expect(l[2]).toContain('1 tanesini ajan önerdi');
  });
  it('şema ve modül kaydı', () => {
    expect(agentVersionSchema.safeParse({ agent_id: 'a', version: 1, status: 'draft', author: 'agent', instructions: 'kısa', can: [], cannot: [], change_note: '' }).success).toBe(false); // talimat çok kısa
    expect(MODULES.find((m) => m.id === 'myagents')).toMatchObject({ slug: 'agents', live: true });
    expect(canAccessModule('creative', 'myagents')).toBe(true); expect(canAccessModule('client_admin', 'myagents')).toBe(false);
  });
});

describe('kişisel ajanlar — DemoRepo uçtan uca (SK üye/lider, OE başka lider, BY sahip)', () => {
  const storage = mem();
  const repo = (accountId: string) => new DemoRepo({ accountId, now: () => T, storage });
  let agentId = '';
  it('üye kendi ajanını kurar; taslak onaysız yürürlüğe girmez', async () => {
    const sk = repo('creative');
    const a = await sk.save('personal_agents', { owner_employee_id: 'SK', base_role: 'design-ui-designer', status: 'active', current_version: 0, name: 'Görsel Ajanım', specialty: 'Sosyal görsel' });
    agentId = a.id;
    const v1 = await proposeVersion(sk, a.id, draft('Marka yönergesine göre görsel brif yaz.'));
    expect(v1).toMatchObject({ version: 1, status: 'draft', author: 'user', created_by: 'SK' });
    expect((await sk.list('personal_agents')).find((x) => x.id === a.id)!.current_version).toBe(0);
    await expect(sk.save('agent_versions', { agent_id: a.id, version: 2, status: 'active', author: 'user', created_by: 'SK', decided_by: null, decided_at: null, ...draft('Doğrudan yürürlüğe almayı dener.') })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sk.save('personal_agents', { id: a.id, current_version: 7 })).rejects.toThrow(/onaylanan sürümle/);
  });
  it('onay: yürürlüğe girer; ikinci onayda önceki sürüm eski olur', async () => {
    const sk = repo('creative');
    const versions = await sk.list('agent_versions');
    const v1 = await approveVersion(sk, pendingDrafts(agentId, versions)[0].id, () => T);
    expect(v1).toMatchObject({ status: 'active', decided_by: 'SK', decided_at: T });
    const v2d = await proposeVersion(sk, agentId, { ...draft('Marka yönergesine göre görsel brif yaz.\nHer brifte ölçüleri belirt.'), change_note: 'ölçü eklendi' }, 'agent');
    expect(v2d).toMatchObject({ version: 2, author: 'agent', status: 'draft' });
    await approveVersion(sk, v2d.id, () => T);
    const after = await sk.list('agent_versions');
    expect(after.filter((v) => v.agent_id === agentId).map((v) => `${v.version}:${v.status}`).sort()).toEqual(['1:superseded', '2:active']);
    expect(activeVersion(agentId, after)!.version).toBe(2);
    expect((await sk.list('personal_agents')).find((x) => x.id === agentId)!.current_version).toBe(2);
    expect(nextVersionNumber(agentId, after)).toBe(3);
  });
  it('sürüm içeriği değiştirilemez; geri alma yeni sürüm olarak eklenir', async () => {
    const sk = repo('creative');
    const versions = await sk.list('agent_versions');
    const v2 = versions.find((v) => v.agent_id === agentId && v.version === 2)!;
    await expect(sk.save('agent_versions', { id: v2.id, instructions: 'Sessizce değiştirilen talimat metni.' })).rejects.toThrow(/değiştirilemez/);
    const v1 = versions.find((v) => v.agent_id === agentId && v.version === 1)!;
    await expect(sk.save('agent_versions', { id: v1.id, status: 'active' })).rejects.toThrow(/Geçersiz sürüm durumu/);
    const v3 = await rollbackTo(sk, v1.id);
    expect(v3).toMatchObject({ version: 3, status: 'active', instructions: v1.instructions, change_note: 'v1 sürümüne geri dönüş' });
    expect((await sk.list('agent_versions')).filter((v) => v.agent_id === agentId && v.status === 'active')).toHaveLength(1);
  });
  it('erişim: başka lider göremez ve yönetemez; ajans sahibi görür; lider ekibindekine ajan kurabilir', async () => {
    const oe = repo('account');
    expect((await listManagedAgents(oe)).agents.find((a) => a.id === agentId)).toBeUndefined();
    await expect(proposeVersion(oe, agentId, draft('Başkasının ajanına taslak eklemeyi dener.'))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(oe.save('personal_agents', { owner_employee_id: 'SK', base_role: null, status: 'active', current_version: 0, name: 'İzinsiz', specialty: '' })).rejects.toBeInstanceOf(ForbiddenError);
    const by = await listManagedAgents(repo('owner'));
    expect(by.agents.find((a) => a.id === agentId)).toBeDefined();
    expect(by.versions.filter((v) => v.agent_id === agentId)).toHaveLength(3);
    const forReport = await repo('creative').save('personal_agents', { owner_employee_id: 'BK', base_role: null, status: 'active', current_version: 0, name: 'BK için ajan', specialty: '' });
    expect(forReport.owner_employee_id).toBe('BK');
  });
  it('ret: taslak reddedilir, yürürlükteki sürüm değişmez', async () => {
    const sk = repo('creative');
    const d = await proposeVersion(sk, agentId, draft('Riskli bir değişiklik önerisi metni.'), 'agent');
    const r = await rejectVersion(sk, d.id, () => T);
    expect(r).toMatchObject({ status: 'rejected', decided_by: 'SK' });
    expect(activeVersion(agentId, await sk.list('agent_versions'))!.version).toBe(3);
    await expect(approveVersion(sk, d.id)).rejects.toThrow(/Yalnızca taslak/);
  });
});
