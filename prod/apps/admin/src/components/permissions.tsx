'use client';
import { useEffect, useMemo, useState } from 'react';
import { CAP_GROUPS, CAP_LABELS, DEFAULT_PERMISSIONS, ROLES, ROLE_LABELS, diffPermissions, effectivePermissions, isClientRole, permissionChanges, type Capability, type PermissionOverrides, type Role } from '@jscore/contracts';
import { Msg, errText } from './admin-ui';
import { useSession } from './session';
import { api, useAdminSettings } from '@/lib/client';

/**
 * Yetki matrisi (0018): roller × yetkiler. Hücre = etkin değer; varsayılandan sapan hücreler işaretli. Kaydetmeden önce fark önizlemesi;
 * "Varsayılana dön" tüm sapmaları siler. Supabase: PATCH /api/admin/permissions (denetim `admin.permissions.update`); demo: Repo ayarları.
 * RLS sert tabandır: matris yalnızca daha sıkı olabilir — RLS'in izin vermediği bir şeyi açmak etkisizdir (müşteri rolleri iç yetki alamaz).
 */
export function PermissionMatrix() {
  const st = useAdminSettings();
  const { mode, repo, bump } = useSession();
  const [full, setFull] = useState<Record<Role, Record<Capability, boolean>> | null>(null);
  const [role, setRole] = useState<Role | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const saved = useMemo(() => (st.settings?.permissions as PermissionOverrides | undefined) ?? {}, [st.settings]);
  useEffect(() => { if (st.settings) setFull(effectivePermissions(saved)); }, [st.settings, saved]);
  if (!full) return <p className="text-sm text-muted">Yükleniyor…</p>;
  const draft = diffPermissions(full as unknown as Record<string, Record<string, boolean>>);
  const changes = permissionChanges(saved, draft);
  const roles = (role === 'all' ? ROLES : [role]) as Role[];
  const toggle = (r: Role, c: Capability) => setFull((f) => (f ? { ...f, [r]: { ...f[r], [c]: !f[r][c] } } : f));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      if (mode === 'demo') { await repo!.saveSettings({ permissions: draft as Record<string, Record<string, boolean>> }); await repo!.audit('admin.permissions.update', 'organizations/settings', { changes: changes.map((c) => `${c.role}:${c.cap}=${c.to}`) }); }
      else await api('/api/admin/permissions', { method: 'PATCH', body: JSON.stringify({ permissions: draft }) });
      setMsg({ ok: true, text: `Kaydedildi · ${changes.length} hücre değişti. Kullanıcı uygulamasında 30 sn içinde etkin.` }); bump();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4">
      <Msg m={msg} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="label mb-0" htmlFor="pm-role">Rol</label>
        <select id="pm-role" className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as Role | 'all')}><option value="all">Tüm roller</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
        <span className="flex-1" />
        <button className="btn btn-sm" disabled={busy || Object.keys(draft).length === 0} onClick={() => setFull(effectivePermissions(null))}>Varsayılana dön</button>
        <button className="btn btn-primary btn-sm" disabled={busy || changes.length === 0} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : `Kaydet${changes.length ? ` (${changes.length})` : ''}`}</button>
      </div>
      {changes.length > 0 && (
        <section className="card" aria-label="Değişiklik önizlemesi"><h3 className="font-bold">Kaydedilecek değişiklikler</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">{changes.map((c) => <li key={`${c.role}:${c.cap}`} className={`chip ${c.to ? 'chip-ok' : 'chip-bad'}`}>{ROLE_LABELS[c.role]} · {CAP_LABELS[c.cap]}: {c.from ? 'açık' : 'kapalı'} → {c.to ? 'açık' : 'kapalı'}</li>)}</ul>
        </section>
      )}
      <div className="card overflow-x-auto">
        <table className="table perm-table">
          <thead><tr><th>Yetki</th>{roles.map((r) => <th key={r} title={isClientRole(r) ? 'Müşteri rolü: yalnızca onay yetkileri etkilidir' : undefined}>{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>
            {CAP_GROUPS.map((g) => (
              <GroupRows key={g.id} label={g.label} caps={g.caps} roles={roles} full={full} onToggle={toggle} disabled={busy} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">● = varsayılandan farklı. Varsayılan matris mevcut davranıştır (ROLE_GRANTS / RLS). Proje üyeliği rolleri (katılımcı &lt; yönetici &lt; proje admini) ve aktif delegasyonlar bu matrisin üstüne ek yetki verir; RLS sert tabandır.</p>
    </div>
  );
}
function GroupRows({ label, caps, roles, full, onToggle, disabled }: { label: string; caps: Capability[]; roles: Role[]; full: Record<Role, Record<Capability, boolean>>; onToggle(r: Role, c: Capability): void; disabled: boolean }) {
  return (
    <>
      <tr className="perm-group"><th colSpan={roles.length + 1}>{label}</th></tr>
      {caps.map((c) => (
        <tr key={c}>
          <th scope="row">{CAP_LABELS[c]}<div className="text-[10px] font-normal text-muted">{c}</div></th>
          {roles.map((r) => {
            const on = full[r][c]; const dev = on !== DEFAULT_PERMISSIONS[r][c];
            const client = isClientRole(r) && !c.startsWith('approvals.');
            return <td key={r}><label className="perm-cell" title={client ? 'Müşteri rolleri için etkisiz (RLS)' : undefined}><input type="checkbox" aria-label={`${ROLE_LABELS[r]} · ${CAP_LABELS[c]}`} checked={on} disabled={disabled || client} onChange={() => onToggle(r, c)} />{dev && <span className="perm-dev" aria-label="varsayılandan farklı">●</span>}</label></td>;
          })}
        </tr>
      ))}
    </>
  );
}
