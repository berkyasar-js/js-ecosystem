'use client';
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  APPROVAL_ACTIONS, APPROVAL_ACTION_LABELS, ROLES, ROLE_LABELS, TASK_STATES, TASK_STATE_LABELS, approvalPolicySchema, buildSteps, resolvePolicy,
  type ApprovalAction, type ApprovalPolicy, type Brand, type PolicyStep, type Role, type TaskState, type TeamMember,
} from '@jscore/contracts';
import { Msg, errText } from './admin-ui';
import { useSession } from './session';
import { Async, Empty, useData } from './ui';

type Draft = { id?: string; name: string; action_type: ApprovalAction; min_amount: string; brand_ids: string[]; brand_status: Array<Brand['status']>; task_types: string; labels: string; to_states: TaskState[]; steps: PolicyStep[]; esc_on: boolean; esc_hours: string; esc_role: Role | ''; esc_employee: string; active: boolean };
const EMPTY: Draft = { name: '', action_type: 'budget', min_amount: '', brand_ids: [], brand_status: [], task_types: '', labels: '', to_states: [], steps: [{ role: 'owner', mode: 'any', sla_hours: 48 }], esc_on: true, esc_hours: '24', esc_role: 'owner', esc_employee: '', active: true };
const toDraft = (p: ApprovalPolicy): Draft => ({
  id: p.id, name: p.name, action_type: p.action_type, min_amount: p.condition.min_amount_minor ? String(p.condition.min_amount_minor / 100) : '', brand_ids: p.condition.brand_ids ?? [], brand_status: p.condition.brand_status ?? [],
  task_types: (p.condition.task_types ?? []).join(', '), labels: (p.condition.labels ?? []).join(', '), to_states: p.condition.to_states ?? [], steps: p.steps.map((s) => ({ ...s })),
  esc_on: !!p.escalation, esc_hours: String(p.escalation?.after_hours ?? 24), esc_role: p.escalation?.to_role ?? '', esc_employee: p.escalation?.to_employee_id ?? '', active: p.active,
});
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const fromDraft = (d: Draft) => approvalPolicySchema.parse({
  name: d.name, action_type: d.action_type, active: d.active,
  condition: { ...(d.min_amount ? { min_amount_minor: Math.round(Number(d.min_amount) * 100) } : {}), ...(d.brand_ids.length ? { brand_ids: d.brand_ids } : {}), ...(d.brand_status.length ? { brand_status: d.brand_status } : {}), ...(list(d.task_types).length ? { task_types: list(d.task_types) } : {}), ...(list(d.labels).length ? { labels: list(d.labels) } : {}), ...(d.to_states.length ? { to_states: d.to_states } : {}) },
  steps: d.steps, escalation: d.esc_on ? { after_hours: Number(d.esc_hours) || 24, to_role: d.esc_role || null, to_employee_id: d.esc_employee || null } : null,
});
const stepText = (s: PolicyStep, team: TeamMember[]) => s.manager_of_requester ? 'Talep edenin yöneticisi' : s.employee_id ? team.find((t) => t.id === s.employee_id)?.name ?? s.employee_id : `${ROLE_LABELS[s.role as Role]}${s.mode === 'all' ? ' (hepsi)' : ''}`;

/**
 * Onay akışları (0018): approval_policies CRUD + "örnek konuya karşı test" (çözümlenen zincir). Eşleşme kuralı: koşulların hepsi sağlanmalı,
 * en çok koşul eşleşen (en özgül) kazanır; politika yoksa tek adımlı required_role davranışı sürer.
 */
export function ApprovalPoliciesEditor() {
  const { repo, bump } = useSession();
  const q = useData(async (r) => ({ policies: (await r.list('approval_policies')) as ApprovalPolicy[], team: await r.team(), brands: await r.listBrands().catch(() => [] as Brand[]), types: await r.listTaskTypes().catch(() => []) }));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!repo || !draft) return;
    setBusy(true); setMsg(null);
    try { const v = fromDraft(draft); await repo.save('approval_policies', draft.id ? { id: draft.id, ...v } : v); setMsg({ ok: true, text: 'Onay akışı kaydedildi.' }); setDraft(null); bump(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { if (!repo || !confirm('Onay akışı silinsin mi? Açık onaylar etkilenmez.')) return; setBusy(true); try { await repo.remove('approval_policies', id); bump(); } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); } };
  return (
    <Async q={q}>{({ policies, team, brands, types }) => (
      <div className="grid gap-5">
        <Msg m={msg} />
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Onay akışları ({policies.length})</h2><button className="btn btn-primary btn-sm" onClick={() => setDraft({ ...EMPTY })}><Plus size={14} aria-hidden /> Yeni akış</button></div>
          {policies.length === 0 ? <Empty>Politika yok: tüm onaylar tek adımlı (talepte verilen rol) çalışır.</Empty> : (
            <ul className="grid gap-2">
              {[...policies].sort((a, b) => a.action_type.localeCompare(b.action_type) || a.created_at.localeCompare(b.created_at)).map((p) => (
                <li key={p.id} className="nested grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{p.name}</strong><span className="chip chip-brand">{APPROVAL_ACTION_LABELS[p.action_type]}</span>{!p.active && <span className="chip">pasif</span>}
                    <span className="text-xs text-muted">{condText(p, brands)}</span>
                    <span className="flex-1" />
                    <button className="btn btn-sm" disabled={busy} onClick={() => setDraft(toDraft(p))}>Düzenle</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} aria-label="Sil" onClick={() => void remove(p.id)}><Trash2 size={14} /></button>
                  </div>
                  <div className="ap-chain text-xs">{p.steps.map((s, i) => <span key={i} className="chip">{stepText(s, team)} · {s.sla_hours} sa</span>)}{p.escalation && <span className="text-muted">↑ {p.escalation.after_hours} sa sonra {p.escalation.to_role ? ROLE_LABELS[p.escalation.to_role] : team.find((t) => t.id === p.escalation?.to_employee_id)?.name ?? '—'}</span>}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {draft && <PolicyForm draft={draft} setDraft={setDraft} team={team} brands={brands} types={types.map((t) => t.key)} busy={busy} onSave={() => void save()} onCancel={() => setDraft(null)} />}
        <Tester policies={policies} team={team} brands={brands} />
      </div>
    )}</Async>
  );
}
function condText(p: ApprovalPolicy, brands: Brand[]) {
  const c = p.condition; const out: string[] = [];
  if (c.min_amount_minor) out.push(`≥ ₺${(c.min_amount_minor / 100).toLocaleString('tr-TR')}`);
  if (c.brand_ids?.length) out.push(`marka: ${c.brand_ids.map((b) => brands.find((x) => x.id === b)?.name ?? b).join(', ')}`);
  if (c.brand_status?.length) out.push(`marka durumu: ${c.brand_status.join('/')}`);
  if (c.task_types?.length) out.push(`tür: ${c.task_types.join('/')}`);
  if (c.labels?.length) out.push(`etiket: ${c.labels.join('/')}`);
  if (c.to_states?.length) out.push(`hedef aşama: ${c.to_states.map((s) => TASK_STATE_LABELS[s as TaskState] ?? s).join('/')}`);
  return out.length ? out.join(' · ') : 'koşulsuz';
}
function PolicyForm({ draft: d, setDraft, team, brands, types, busy, onSave, onCancel }: { draft: Draft; setDraft(d: Draft): void; team: TeamMember[]; brands: Brand[]; types: string[]; busy: boolean; onSave(): void; onCancel(): void }) {
  const set = (p: Partial<Draft>) => setDraft({ ...d, ...p });
  const setStep = (i: number, p: Partial<PolicyStep>) => set({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const kindOf = (s: PolicyStep) => (s.manager_of_requester ? 'manager' : s.employee_id ? 'employee' : 'role');
  const valid = (() => { try { fromDraft(d); return true; } catch { return false; } })();
  return (
    <form className="card grid gap-4" onSubmit={(e) => { e.preventDefault(); onSave(); }} aria-label={d.id ? 'Onay akışını düzenle' : 'Yeni onay akışı'}>
      <h2 className="font-bold">{d.id ? 'Onay akışını düzenle' : 'Yeni onay akışı'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ap-name">Ad</label><input id="ap-name" className="input" required value={d.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div><label className="label" htmlFor="ap-action">Eylem</label><select id="ap-action" className="input" value={d.action_type} onChange={(e) => set({ action_type: e.target.value as ApprovalAction })}>{APPROVAL_ACTIONS.map((a) => <option key={a} value={a}>{APPROVAL_ACTION_LABELS[a]}</option>)}</select></div>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="label">Koşullar (boş = her zaman)</legend>
        <div><label className="label" htmlFor="ap-min">En az tutar (₺)</label><input id="ap-min" className="input" type="number" min={0} value={d.min_amount} onChange={(e) => set({ min_amount: e.target.value })} /></div>
        <div><label className="label" htmlFor="ap-types">Görev türleri (virgülle)</label><input id="ap-types" className="input" list="ap-type-list" value={d.task_types} onChange={(e) => set({ task_types: e.target.value })} /><datalist id="ap-type-list">{types.map((t) => <option key={t} value={t} />)}</datalist></div>
        <div><label className="label" htmlFor="ap-labels">Etiketler (virgülle, biri yeter)</label><input id="ap-labels" className="input" value={d.labels} onChange={(e) => set({ labels: e.target.value })} /></div>
        <div><span className="label">Marka durumu</span><div className="flex flex-wrap gap-3 text-sm">{(['active', 'risky', 'prospect'] as const).map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={d.brand_status.includes(s)} onChange={(e) => set({ brand_status: e.target.checked ? [...d.brand_status, s] : d.brand_status.filter((x) => x !== s) })} />{s === 'active' ? 'Aktif' : s === 'risky' ? 'Riskli' : 'Aday'}</label>)}</div></div>
        <div><label className="label" htmlFor="ap-brands">Markalar</label><select id="ap-brands" className="input" multiple size={4} value={d.brand_ids} onChange={(e) => set({ brand_ids: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        {d.action_type === 'task_stage' && <div><span className="label">Hedef aşama</span><div className="flex flex-wrap gap-3 text-sm">{TASK_STATES.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={d.to_states.includes(s)} onChange={(e) => set({ to_states: e.target.checked ? [...d.to_states, s] : d.to_states.filter((x) => x !== s) })} />{TASK_STATE_LABELS[s]}</label>)}</div></div>}
      </fieldset>
      <fieldset className="grid gap-2"><legend className="label">Adımlar (sırayla)</legend>
        {d.steps.map((s, i) => (
          <div key={i} className="nested flex flex-wrap items-center gap-2">
            <span className="chip">{i + 1}</span>
            <select className="input w-auto" aria-label="Onaylayıcı türü" value={kindOf(s)} onChange={(e) => { const k = e.target.value; setStep(i, k === 'manager' ? { manager_of_requester: true, role: null, employee_id: null } : k === 'employee' ? { manager_of_requester: false, role: null, employee_id: team[0]?.id ?? null } : { manager_of_requester: false, employee_id: null, role: 'owner' }); }}>
              <option value="role">Rol</option><option value="employee">Kişi</option><option value="manager">Talep edenin yöneticisi</option>
            </select>
            {kindOf(s) === 'role' && <select className="input w-auto" aria-label="Rol" value={s.role ?? 'owner'} onChange={(e) => setStep(i, { role: e.target.value as Role })}>{ROLES.filter((r) => !r.startsWith('client')).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>}
            {kindOf(s) === 'employee' && <select className="input w-auto" aria-label="Kişi" value={s.employee_id ?? ''} onChange={(e) => setStep(i, { employee_id: e.target.value })}>{team.filter((t) => t.status === 'active').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
            {kindOf(s) === 'role' && <select className="input w-auto" aria-label="Mod" value={s.mode} onChange={(e) => setStep(i, { mode: e.target.value as 'any' | 'all' })}><option value="any">Biri yeter</option><option value="all">Hepsi</option></select>}
            <label className="flex items-center gap-1 text-sm">SLA <input className="input w-20" type="number" min={1} value={s.sla_hours} onChange={(e) => setStep(i, { sla_hours: Number(e.target.value) || 1 })} /> sa</label>
            <span className="flex-1" />
            <button type="button" className="btn btn-ghost btn-sm" disabled={d.steps.length === 1} aria-label="Adımı sil" onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm w-fit" disabled={d.steps.length >= 8} onClick={() => set({ steps: [...d.steps, { role: 'owner', mode: 'any', sla_hours: 48 }] })}><Plus size={14} aria-hidden /> Adım ekle</button>
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-3"><legend className="label">Yükseltme (SLA aşımı)</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.esc_on} onChange={(e) => set({ esc_on: e.target.checked })} /> Açık</label>
        {d.esc_on && <><label className="flex items-center gap-1 text-sm">son tarihten <input className="input w-20" type="number" min={1} value={d.esc_hours} onChange={(e) => set({ esc_hours: e.target.value })} /> sa sonra</label>
          <select className="input w-auto" aria-label="Yükseltme rolü" value={d.esc_role} onChange={(e) => set({ esc_role: e.target.value as Role | '', esc_employee: '' })}><option value="">Kişi seç…</option>{ROLES.filter((r) => !r.startsWith('client')).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
          {!d.esc_role && <select className="input w-auto" aria-label="Yükseltme kişisi" value={d.esc_employee} onChange={(e) => set({ esc_employee: e.target.value })}><option value="">—</option>{team.filter((t) => t.status === 'active').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</>}
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> Aktif</label>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy || !valid}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button><button type="button" className="btn" onClick={onCancel} disabled={busy}>Vazgeç</button></div>
    </form>
  );
}
/** Örnek konuya karşı test: eylem + tutar + marka + tür/etiket + talep eden → eşleşen politika ve somut zincir. */
function Tester({ policies, team, brands }: { policies: ApprovalPolicy[]; team: TeamMember[]; brands: Brand[] }) {
  const [action, setAction] = useState<ApprovalAction>('budget');
  const [amount, setAmount] = useState('30000');
  const [brand, setBrand] = useState('');
  const [taskType, setTaskType] = useState('');
  const [labels, setLabels] = useState('');
  const [toState, setToState] = useState<TaskState>('delivery');
  const [requester, setRequester] = useState(team.find((t) => t.app_role === 'creative')?.id ?? team[0]?.id ?? '');
  const b = brands.find((x) => x.id === brand) ?? null;
  const result = useMemo(() => {
    const pol = resolvePolicy(policies, action, { amount_minor: Math.round(Number(amount || 0) * 100), brand_id: brand || undefined, brand: b ? { id: b.id, status: b.status } : null, task_type: taskType || undefined, labels: list(labels), to_state: action === 'task_stage' ? toState : undefined });
    return pol ? { pol, steps: buildSteps(pol.steps, { requesterEmployeeId: requester, team }) } : null;
  }, [policies, action, amount, brand, b, taskType, labels, toState, requester, team]);
  return (
    <section className="card grid gap-3" aria-label="Onay akışı testi">
      <h2 className="font-bold">Test et: bu konu hangi zincire düşer?</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="tt-a">Eylem</label><select id="tt-a" className="input" value={action} onChange={(e) => setAction(e.target.value as ApprovalAction)}>{APPROVAL_ACTIONS.map((a) => <option key={a} value={a}>{APPROVAL_ACTION_LABELS[a]}</option>)}</select></div>
        <div><label className="label" htmlFor="tt-amt">Tutar (₺)</label><input id="tt-amt" className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label className="label" htmlFor="tt-b">Marka</label><select id="tt-b" className="input" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">—</option>{brands.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.status})</option>)}</select></div>
        <div><label className="label" htmlFor="tt-t">Görev türü</label><input id="tt-t" className="input" value={taskType} onChange={(e) => setTaskType(e.target.value)} placeholder="video_edit" /></div>
        <div><label className="label" htmlFor="tt-l">Etiketler</label><input id="tt-l" className="input" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="acil, kasım" /></div>
        <div><label className="label" htmlFor="tt-r">Talep eden</label><select id="tt-r" className="input" value={requester} onChange={(e) => setRequester(e.target.value)}>{team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        {action === 'task_stage' && <div><label className="label" htmlFor="tt-s">Hedef aşama</label><select id="tt-s" className="input" value={toState} onChange={(e) => setToState(e.target.value as TaskState)}>{TASK_STATES.map((s) => <option key={s} value={s}>{TASK_STATE_LABELS[s]}</option>)}</select></div>}
      </div>
      <div className="nested text-sm">
        {result ? (
          <>
            <div className="mb-2"><strong>{result.pol.name}</strong> eşleşti · {result.steps.length} adım{result.pol.escalation ? ` · yükseltme ${result.pol.escalation.after_hours} sa` : ''}</div>
            <div className="ap-chain">{result.steps.map((s) => <span key={s.step_index} className={`chip ${s.unresolved ? 'chip-warn' : ''}`}>{s.approvers.length ? s.approvers.map((id) => team.find((t) => t.id === id)?.name ?? id).join(s.mode === 'all' ? ' + ' : ' / ') : ROLE_LABELS[s.approver_role as Role]} · {s.sla_hours} sa{s.unresolved ? ' (yönetici yok → owner)' : ''}</span>)}</div>
          </>
        ) : <span className="text-muted">Eşleşen politika yok → tek adım: talepte verilen rol (mevcut davranış).</span>}
      </div>
    </section>
  );
}
