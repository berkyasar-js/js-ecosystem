'use client';
import { useState } from 'react';
import { ROLE_LABELS, type Role } from '@jscore/contracts';
import { Async, PageHeader } from '@/components/ui';
import { Msg, NeedsSupabase, errText } from '@/components/admin-ui';
import { APP_URL } from '@/components/admin-shell';
import { api, useApi } from '@/lib/client';

interface Data {
  employees: Array<{ id: string; code: string | null; name: string; role_title: string; app_role: Role; status: string; weekly_hours: number; auth_user_id: string | null; email: string; membership: { role: Role; status: string } | null }>;
  members: Array<{ user_id: string; email: string; role: Role }>;
}

export default function Employees() {
  return (
    <>
      <PageHeader title="Çalışanlar" sub="Çalışan kayıtları ↔ kullanıcı hesapları" actions={APP_URL ? <a className="btn" href={`${APP_URL}/app/people`} target="_blank" rel="noreferrer">JS People’da aç →</a> : undefined} />
      <NeedsSupabase><Inner /></NeedsSupabase>
    </>
  );
}
function Inner() {
  const q = useApi<Data>('/api/admin/employees');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const link = async (employee_id: string, user_id: string | null) => {
    try { await api('/api/admin/employees', { method: 'PUT', body: JSON.stringify({ employee_id, user_id }) }); setMsg({ ok: true, text: user_id ? 'Bağlandı.' : 'Bağ kaldırıldı.' }); q.reload(); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  return (
    <>
      <Msg m={msg} />
      <Async q={q}>{(d) => {
        const taken = new Set(d.employees.map((e) => e.auth_user_id).filter(Boolean));
        return (
          <section className="card overflow-x-auto">
            <table className="table"><thead><tr><th>Çalışan</th><th>Unvan</th><th>Durum</th><th>Hesap</th><th>Bağla</th></tr></thead><tbody>
              {d.employees.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.name}</strong>{e.code && <span className="chip ml-2">{e.code}</span>}</td>
                  <td>{e.role_title || '—'}</td>
                  <td><span className={`chip ${e.status === 'active' ? 'chip-ok' : ''}`}>{e.status === 'active' ? 'Aktif' : 'Ayrıldı'}</span></td>
                  <td>{e.auth_user_id ? <>{e.email || e.auth_user_id.slice(0, 8)} {e.membership && <span className="chip chip-brand">{ROLE_LABELS[e.membership.role]}</span>}</> : <span className="text-muted">Hesap yok</span>}</td>
                  <td>
                    <select className="input" aria-label={`${e.name} için hesap`} value={e.auth_user_id ?? ''} onChange={(ev) => void link(e.id, ev.target.value || null)}>
                      <option value="">Bağlı değil</option>
                      {d.members.filter((m) => !taken.has(m.user_id) || m.user_id === e.auth_user_id).map((m) => <option key={m.user_id} value={m.user_id}>{m.email || m.user_id.slice(0, 8)}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody></table>
            <p className="mt-3 text-xs text-muted">Çalışan kartları (izin, zimmet, HRIS) JS People’da yönetilir; burada yalnızca hesap bağlantısı kurulur. Yeni hesap için Kullanıcılar & Roller → davet.</p>
          </section>
        );
      }}</Async>
    </>
  );
}
