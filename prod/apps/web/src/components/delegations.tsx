'use client';
import { useState } from 'react';
import { CAP_GROUPS, CAP_LABELS, can, delegationNeedsApproval, type Capability, type Delegation } from '@jscore/contracts';
import { requestDelegation, revokeDelegation } from '@jscore/core/delegations';
import { useSession } from './session';
import { Async, fmtDate, todayFor, useData } from './ui';

const STATUS: Record<Delegation['status'], [string, string]> = { active: ['Aktif', 'chip-ok'], pending: ['Owner onayı bekliyor', 'chip-warn'], revoked: ['İptal', ''] };
const plusDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

/**
 * "Delege et" (0018): izin/seyahat gibi dönemlerde yetkilerini geçici olarak devret. Self-servis: yalnızca kendi adına; hassas yetkiler
 * (onay kararı, finans) owner onayına düşer. Owner/org admin herkes adına ve doğrudan aktif açar (admin panelinde de aynı panel).
 */
export function DelegationPanel({ adminMode = false }: { adminMode?: boolean }) {
  const { me, repo, mode, bump } = useSession();
  const q = useData(async (r) => ({ team: await r.team(), delegations: await r.list('delegations').catch(() => [] as Delegation[]) }));
  const today = todayFor(mode);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [caps, setCaps] = useState<string[]>([]);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(plusDays(today, 7));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!me) return null;
  const manage = adminMode && can(me, 'delegations.manage');
  const fromId = manage ? from || me.employee_id || '' : me.employee_id || '';
  const toggle = (c: string) => setCaps((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !q.data || !fromId || !to || !caps.length) return;
    setBusy(true); setMsg(null);
    try {
      const r = await requestDelegation(repo, me, { from_employee_id: fromId, to_employee_id: to, caps, starts_at: `${start}T00:00:00Z`, ends_at: `${end}T23:59:59Z`, reason }, q.data.team);
      setMsg({ ok: true, text: r.approvalId ? 'Delegasyon owner onayına gönderildi; onaylanınca etkinleşir.' : 'Delegasyon etkin.' });
      setCaps([]); setReason(''); setTo(''); bump();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Kaydedilemedi' }); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { if (!repo) return; setBusy(true); try { await revokeDelegation(repo, id); bump(); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'İptal edilemedi' }); } finally { setBusy(false); } };
  return (
    <Async q={q}>{({ team, delegations }) => {
      const name = (id: string) => team.find((t) => t.id === id)?.name ?? id;
      const rows = (manage ? delegations : delegations.filter((d) => d.from_employee_id === me.employee_id || d.to_employee_id === me.employee_id)).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const sensitive = delegationNeedsApproval(caps) && !(me.role === 'owner' && manage);
      return (
        <div className="grid gap-4">
          {!me.employee_id && !manage && <p className="text-sm text-muted">Hesabın bir çalışan kaydına bağlı değil; delegasyon açamazsın.</p>}
          <form className="card grid gap-3" onSubmit={submit} aria-label="Delege et">
            <h2 className="font-bold">Delege et</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {manage && <div><label className="label" htmlFor="dg-from">Kimden</label><select id="dg-from" className="input" value={fromId} onChange={(e) => setFrom(e.target.value)}>{team.filter((t) => t.status === 'active').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
              <div><label className="label" htmlFor="dg-to">Kime</label><select id="dg-to" className="input" required value={to} onChange={(e) => setTo(e.target.value)}><option value="">Seç…</option>{team.filter((t) => t.status === 'active' && t.id !== fromId).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role_title}</option>)}</select></div>
              <div><label className="label" htmlFor="dg-s">Başlangıç</label><input id="dg-s" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><label className="label" htmlFor="dg-e">Bitiş</label><input id="dg-e" type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="dg-r">Neden</label><input id="dg-r" className="input" placeholder="Yıllık izin, seyahat…" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </div>
            <fieldset><legend className="label">Devredilen yetkiler</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {CAP_GROUPS.map((g) => (
                  <div key={g.id} className="nested"><div className="mb-1 text-xs font-semibold text-muted">{g.label}</div>
                    {g.caps.filter((c) => manage || can(me, c)).map((c) => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={caps.includes(c)} onChange={() => toggle(c)} /> {CAP_LABELS[c as Capability]}</label>)}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">{manage ? 'Admin: her yetki seçilebilir.' : 'Yalnızca sende olan yetkileri devredebilirsin.'}{sensitive ? ' Onay kararı / finans yetkileri owner onayı gerektirir.' : ''}</p>
            </fieldset>
            <button className="btn btn-primary w-fit" disabled={busy || !to || !caps.length || !fromId || end < start}>{busy ? 'Kaydediliyor…' : sensitive ? 'Onaya gönder' : 'Delege et'}</button>
            {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-muted' : 'text-magenta'}`}>{msg.text}</p>}
          </form>
          <section className="card">
            <h2 className="mb-3 font-bold">Delegasyonlar</h2>
            {rows.length === 0 ? <p className="text-sm text-muted">Kayıt yok.</p> : (
              <ul className="grid gap-2">
                {rows.map((d) => { const [label, cls] = STATUS[d.status]; const live = d.status === 'active' && d.ends_at > `${today}T00:00:00Z`; return (
                  <li key={d.id} className="nested flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{name(d.from_employee_id)} → {name(d.to_employee_id)}</span>
                    <span className={`chip ${live ? cls : d.status === 'active' ? '' : cls}`}>{live || d.status !== 'active' ? label : 'Süresi doldu'}</span>
                    <span className="text-xs text-muted">{fmtDate(d.starts_at)} – {fmtDate(d.ends_at)}{d.reason ? ` · ${d.reason}` : ''}</span>
                    <span className="flex flex-wrap gap-1">{d.caps.map((c) => <span key={c} className="chip">{c === '*' ? 'Tümü' : CAP_LABELS[c as Capability] ?? c}</span>)}</span>
                    {d.status !== 'revoked' && (manage || d.from_employee_id === me.employee_id) && <button className="btn btn-ghost btn-sm ml-auto" disabled={busy} onClick={() => void revoke(d.id)}>İptal et</button>}
                  </li>
                ); })}
              </ul>
            )}
          </section>
        </div>
      );
    }}</Async>
  );
}
