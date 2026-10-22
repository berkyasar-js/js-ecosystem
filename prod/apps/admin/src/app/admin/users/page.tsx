'use client';
import { useState } from 'react';
import { ROLES, ROLE_LABELS, canAssignRole, isClientRole, type Role } from '@jscore/contracts';
import { Async, PageHeader, fmtTime } from '@/components/ui';
import { Msg, NeedsSupabase, errText } from '@/components/admin-ui';
import { api, useApi } from '@/lib/client';

interface U {
  user_id: string; email: string; name: string; role: Role; status: 'active' | 'disabled'; scopes: { client_ids?: string[]; brand_ids?: string[] };
  employee_id: string | null; employee_name: string | null; last_sign_in_at: string | null; confirmed: boolean; banned_until: string | null; mfa_factors: number; providers: string[];
}
interface Data { users: U[]; employees: Array<{ id: string; name: string; role_title: string; code: string | null; auth_user_id: string | null }>; clients: Array<{ id: string; name: string }>; me: string; my_role: Role }

export default function Users() {
  return (<><PageHeader title="Kullanıcılar & Roller" sub="Üyelik, rol, müşteri kapsamı, oturum ve parola/MFA süreçleri" /><NeedsSupabase><Inner /></NeedsSupabase></>);
}

function Inner() {
  const q = useApi<Data>('/api/admin/users');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  return (
    <>
      <Msg m={msg} />
      <Async q={q}>{(d) => {
        const list = d.users.filter((u) => `${u.name} ${u.email} ${ROLE_LABELS[u.role]}`.toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr')));
        const picked = d.users.find((u) => u.user_id === sel) ?? null;
        return (
          <div className="grid gap-5">
            <Invite d={d} onDone={(t) => { setMsg({ ok: true, text: t }); q.reload(); }} onError={(t) => setMsg({ ok: false, text: t })} />
            <section className="card overflow-x-auto">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Üyeler ({d.users.length})</h2><input className="input max-w-xs" placeholder="Ara: ad, e-posta, rol" aria-label="Üye ara" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
              <table className="table"><thead><tr><th>Kullanıcı</th><th>Rol</th><th>Çalışan</th><th>Durum</th><th>MFA</th><th>Son giriş</th><th></th></tr></thead><tbody>
                {list.map((u) => (
                  <tr key={u.user_id} aria-selected={sel === u.user_id}>
                    <td><strong>{u.name}</strong><div className="text-xs text-muted">{u.email}{u.user_id === d.me && ' · sen'}</div></td>
                    <td><span className="chip chip-brand">{ROLE_LABELS[u.role]}</span></td>
                    <td>{u.employee_name ?? <span className="text-muted">—</span>}</td>
                    <td>{u.status === 'disabled' ? <span className="chip chip-bad">Devre dışı</span> : !u.confirmed ? <span className="chip chip-warn">Davet bekliyor</span> : <span className="chip chip-ok">Aktif</span>}</td>
                    <td>{u.mfa_factors ? <span className="chip chip-ok">{u.mfa_factors} faktör</span> : <span className="text-muted">—</span>}</td>
                    <td>{u.last_sign_in_at ? fmtTime(u.last_sign_in_at) : '—'}</td>
                    <td><button className="btn btn-sm" onClick={() => setSel(sel === u.user_id ? null : u.user_id)} aria-expanded={sel === u.user_id}>Yönet</button></td>
                  </tr>
                ))}
              </tbody></table>
            </section>
            {picked && <Manage key={picked.user_id} u={picked} d={d} onClose={() => setSel(null)} onDone={(t) => { setMsg({ ok: true, text: t }); q.reload(); }} onError={(t) => setMsg({ ok: false, text: t })} />}
          </div>
        );
      }}</Async>
    </>
  );
}

function ClientScopes({ d, value, onChange }: { d: Data; value: string[]; onChange(v: string[]): void }) {
  return (
    <fieldset><legend className="label">Müşteri kapsamı (zorunlu)</legend>
      {d.clients.length === 0 ? <p className="text-xs text-muted">Tanımlı müşteri yok.</p> : <div className="flex flex-wrap gap-3">{d.clients.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} /> {c.name}</label>
      ))}</div>}
    </fieldset>
  );
}

function Invite({ d, onDone, onError }: { d: Data; onDone(t: string): void; onError(t: string): void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('creative');
  const [emp, setEmp] = useState('');
  const [clients, setClients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const freeEmps = d.employees.filter((e) => !e.auth_user_id);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api<{ invited: boolean }>('/api/admin/users', { method: 'POST', body: JSON.stringify({ email, role, employee_id: emp || null, client_ids: isClientRole(role) ? clients : undefined }) });
      onDone(r.invited ? `Davet e-postası gönderildi: ${email}` : `${email} organizasyona eklendi (hesabı zaten vardı).`);
      setEmail(''); setEmp(''); setClients([]);
    } catch (err) { onError(errText(err)); } finally { setBusy(false); }
  };
  return (
    <form className="card grid gap-4" onSubmit={submit}>
      <h2 className="font-bold">E-posta ile davet et</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label" htmlFor="inv-email">E-posta</label><input id="inv-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@sirket.com" /></div>
        <div><label className="label" htmlFor="inv-role">Rol</label><select id="inv-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.filter((r) => canAssignRole(d.my_role, r)).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        <div><label className="label" htmlFor="inv-emp">Çalışan bağlantısı</label><select id="inv-emp" className="input" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Bağlama</option>{freeEmps.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` (${e.code})` : ''}</option>)}</select></div>
      </div>
      {isClientRole(role) && <ClientScopes d={d} value={clients} onChange={setClients} />}
      <button className="btn btn-primary w-fit" disabled={busy || !email || (isClientRole(role) && !clients.length)}>{busy ? 'Gönderiliyor…' : 'Davet gönder'}</button>
    </form>
  );
}

function Manage({ u, d, onClose, onDone, onError }: { u: U; d: Data; onClose(): void; onDone(t: string): void; onError(t: string): void }) {
  const [role, setRole] = useState<Role>(u.role);
  const [emp, setEmp] = useState(u.employee_id ?? '');
  const [clients, setClients] = useState<string[]>(u.scopes.client_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const self = u.user_id === d.me;
  const locked = !canAssignRole(d.my_role, u.role);
  const run = async (fn: () => Promise<string>) => { setBusy(true); try { onDone(await fn()); } catch (e) { onError(errText(e)); } finally { setBusy(false); } };
  const patch = (body: object, ok: string) => run(async () => { await api(`/api/admin/users/${u.user_id}`, { method: 'PATCH', body: JSON.stringify(body) }); return ok; });
  const act = (action: string, ok: string, extra: object = {}) => run(async () => {
    const r = await api<{ link?: string | null; revoked?: number; removed?: number }>(`/api/admin/users/${u.user_id}/actions`, { method: 'POST', body: JSON.stringify({ action, ...extra }) });
    if (r.link) setLink(r.link);
    return r.revoked !== undefined ? `${ok} (${r.revoked} oturum)` : r.removed !== undefined ? `${ok} (${r.removed} faktör)` : ok;
  });
  const dirty = role !== u.role || emp !== (u.employee_id ?? '') || JSON.stringify([...clients].sort()) !== JSON.stringify([...(u.scopes.client_ids ?? [])].sort());
  return (
    <section className="card grid gap-5" aria-label={`${u.name} yönetimi`}>
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{u.name}</h2><p className="text-sm text-muted">{u.email} · giriş: {u.providers.join(', ') || 'e-posta'}</p></div><button className="btn btn-sm" onClick={onClose}>Kapat</button></div>
      {locked && <p className="text-sm text-muted" role="note">Owner hesabı üzerinde yalnızca owner işlem yapabilir.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="m-role">Rol</label><select id="m-role" className="input" value={role} disabled={self || locked} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.filter((r) => canAssignRole(d.my_role, r) || r === u.role).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>{self && <p className="mt-1 text-xs text-muted">Kendi rolünü değiştiremezsin.</p>}</div>
        <div><label className="label" htmlFor="m-emp">Çalışan bağlantısı</label><select id="m-emp" className="input" value={emp} disabled={locked} onChange={(e) => setEmp(e.target.value)}><option value="">Bağlı değil</option>{d.employees.filter((e) => !e.auth_user_id || e.id === u.employee_id).map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` (${e.code})` : ''}</option>)}</select></div>
      </div>
      {isClientRole(role) && <ClientScopes d={d} value={clients} onChange={setClients} />}
      <div><button className="btn btn-primary" disabled={busy || locked || !dirty || (isClientRole(role) && !clients.length)} onClick={() => void patch({ role: role !== u.role ? role : undefined, employee_id: emp !== (u.employee_id ?? '') ? emp || null : undefined, client_ids: isClientRole(role) ? clients : undefined }, 'Kaydedildi.')}>Değişiklikleri kaydet</button></div>

      <div className="border-t border-line pt-4">
        <h3 className="label">Parola & oturum süreçleri</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm" disabled={busy || locked} onClick={() => void act('reset_password', 'Parola sıfırlama e-postası gönderildi.')}>Parola sıfırlama e-postası</button>
          <button className="btn btn-sm" disabled={busy || locked} onClick={() => void act('send_magic_link', 'Giriş bağlantısı e-posta ile gönderildi.')}>Sihirli bağlantı gönder</button>
          <button className="btn btn-sm" disabled={busy || locked} onClick={() => void act('copy_link', 'Bağlantı üretildi.', { link_type: 'magiclink' })}>Giriş bağlantısı üret</button>
          <button className="btn btn-sm" disabled={busy || locked} onClick={() => void act('copy_link', 'Bağlantı üretildi.', { link_type: 'recovery' })}>Kurtarma bağlantısı üret</button>
          {!u.confirmed && <button className="btn btn-sm" disabled={busy || locked} onClick={() => void act('resend_invite', 'Davet yeniden gönderildi.')}>Daveti yeniden gönder</button>}
          <button className="btn btn-sm" disabled={busy || locked || self} onClick={() => { if (confirm('Tüm oturumları sonlandırılsın mı? Kullanıcı yeniden giriş yapmalı.')) void act('revoke_sessions', 'Oturumlar sonlandırıldı.'); }}>Oturumları sonlandır</button>
          <button className="btn btn-sm" disabled={busy || locked || !u.mfa_factors} onClick={() => { if (confirm('Kullanıcının MFA faktörleri silinsin mi? (Cihaz kaybında kullanılır.)')) void act('reset_mfa', 'MFA sıfırlandı.'); }}>MFA’yı sıfırla</button>
        </div>
        {link && <div className="nested mt-3"><p className="text-xs text-muted">Tek kullanımlık bağlantı — yalnızca kullanıcıya güvenli kanaldan ilet; bu ekrandan ayrılınca kaybolur.</p><code className="mt-1 block break-all text-xs" data-testid="gen-link">{link}</code></div>}
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="label">Hesap durumu</h3>
        <div className="flex flex-wrap gap-2">
          {u.status === 'active'
            ? <button className="btn btn-sm" disabled={busy || locked || self} onClick={() => { if (confirm(`${u.name} devre dışı bırakılsın mı? Oturumları sonlandırılır ve giriş engellenir.`)) void patch({ status: 'disabled' }, 'Kullanıcı devre dışı bırakıldı.'); }}>Devre dışı bırak</button>
            : <button className="btn btn-sm btn-primary" disabled={busy || locked} onClick={() => void patch({ status: 'active' }, 'Kullanıcı yeniden etkinleştirildi.')}>Yeniden etkinleştir</button>}
          <button className="btn btn-sm" disabled={busy || locked || self} onClick={() => { if (confirm(`${u.name} organizasyondan çıkarılsın mı? (Hesap silinmez, üyelik kalkar.)`)) void run(async () => { await api(`/api/admin/users/${u.user_id}`, { method: 'DELETE' }); onClose(); return 'Üyelik kaldırıldı.'; }); }}>Üyeliği kaldır</button>
        </div>
      </div>
    </section>
  );
}
