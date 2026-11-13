'use client';
import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PROJECT_ROLES, PROJECT_ROLE_LABELS, type ProjectMember, type ProjectRole, type TeamMember } from '@jscore/contracts';
import { Avatar } from '../avatar';
import { useSession } from '../session';
import { useToast } from '../toasts';

/**
 * Proje üyeleri (0017): izleyici / katılımcı / yönetici / proje admini. İç roller org genelinde okur; proje yöneticisi/admini (üyelik) proje metasını düzenleyebilir (RLS).
 * Yazma: owner/org_admin/operations/account/pm ya da projede manager/admin olan üye.
 */
export function MembersPanel({ projectId, members, team, onChange, assigneeIds = [] }: { projectId: string; members: ProjectMember[]; team: TeamMember[]; onChange: (m: ProjectMember[]) => void; assigneeIds?: string[] }) {
  const { repo, me } = useSession();
  const toast = useToast();
  const id = useId();
  const [emp, setEmp] = useState('');
  const [role, setRole] = useState<ProjectRole>('collaborator');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const myRole = members.find((m) => m.employee_id === me?.employee_id)?.role;
  const canEdit = !!me && (['owner', 'org_admin', 'operations', 'account', 'pm'].includes(me.role) || myRole === 'manager' || myRole === 'admin');
  const name = (eid: string) => team.find((t) => t.id === eid)?.name ?? eid;
  const missing = assigneeIds.filter((a) => !members.some((m) => m.employee_id === a));
  const add = async (employee_id: string, r: ProjectRole) => {
    if (!repo || !employee_id || busy) return;
    setBusy(true); setErr(null);
    try { const m = await repo.save('project_members', { project_id: projectId, employee_id, role: r }); onChange([...members, m]); setEmp(''); toast.success('Üye eklendi', `${name(employee_id)} · ${PROJECT_ROLE_LABELS[r]}`); }
    catch (ex) { setErr(ex instanceof Error ? ex.message : 'Eklenemedi'); } finally { setBusy(false); }
  };
  const setMemberRole = async (m: ProjectMember, r: ProjectRole) => { if (!repo) return; try { const n = await repo.save('project_members', { id: m.id, role: r }); onChange(members.map((x) => (x.id === m.id ? n : x))); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Güncellenemedi'); } };
  const remove = async (m: ProjectMember) => { if (!repo) return; try { await repo.remove('project_members', m.id); onChange(members.filter((x) => x.id !== m.id)); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Çıkarılamadı'); } };
  return (
    <div className="wk-pad">
      <section className="wk-box" aria-label="Proje üyeleri">
        <h3>Üyeler <span className="wk-chip">{members.length}</span></h3>
        <p className="wk-muted" style={{ fontSize: 12, marginBottom: 10 }}>İzleyici yalnızca izler; katılımcı görev yazar; yönetici ve proje admini proje ayarlarını değiştirir ve üye ekler. Org rolleri (owner, operasyon, PM…) her projede yetkilidir.</p>
        {err && <p role="alert" className="wk-error">{err}</p>}
        {members.length === 0 ? <p className="wk-muted">Henüz üye yok.</p> : (
          <ul className="wk-list">
            {members.map((m) => (
              <li key={m.id}>
                <span className="wk-person"><Avatar id={m.employee_id} name={name(m.employee_id)} size="sm" /><span>{name(m.employee_id)}<small className="wk-muted" style={{ display: 'block', fontSize: 11 }}>{team.find((t) => t.id === m.employee_id)?.role_title}</small></span></span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {canEdit ? <><label className="wk-sr" htmlFor={`${id}-r-${m.id}`}>Rol</label><select id={`${id}-r-${m.id}`} className="wk-field" style={{ width: 'auto', minHeight: 32 }} value={m.role} onChange={(e) => void setMemberRole(m, e.target.value as ProjectRole)}>{PROJECT_ROLES.map((r) => <option key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</option>)}</select>
                    <button type="button" className="wk-ib" aria-label={`${name(m.employee_id)} üyelikten çıkar`} onClick={() => void remove(m)}><Trash2 size={15} aria-hidden /></button></>
                    : <span className="wk-chip">{PROJECT_ROLE_LABELS[m.role]}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <>
            <form className="wk-toolbar" style={{ paddingBottom: 0 }} onSubmit={(e) => { e.preventDefault(); void add(emp, role); }} aria-busy={busy}>
              <label className="wk-sr" htmlFor={`${id}-e`}>Kişi</label>
              <select id={`${id}-e`} className="wk-field" style={{ flex: 1, minWidth: 180 }} value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Kişi seç…</option>{team.filter((t) => t.status === 'active' && !members.some((m) => m.employee_id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              <label className="wk-sr" htmlFor={`${id}-ro`}>Rol</label>
              <select id={`${id}-ro`} className="wk-field" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>{PROJECT_ROLES.map((r) => <option key={r} value={r}>{PROJECT_ROLE_LABELS[r]}</option>)}</select>
              <button type="submit" className="wk-btn" data-sm disabled={!emp || busy}><Plus size={14} aria-hidden />Ekle</button>
            </form>
            {missing.length > 0 && <p className="wk-muted" style={{ marginTop: 10, fontSize: 12 }}>Görev sorumlusu olup üye olmayanlar: {missing.map((a) => <button key={a} type="button" className="wk-chip" style={{ marginLeft: 4 }} onClick={() => void add(a, 'collaborator')}>+ {name(a)}</button>)}</p>}
          </>
        )}
      </section>
    </div>
  );
}
