'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLE_LABELS, type Role, type TeamMember } from '@jscore/contracts';
import { Async, Loading, PageHeader, Tabs } from '@/components/ui';
import { Msg, NeedsSupabase, errText } from '@/components/admin-ui';
import { APP_URL } from '@/components/admin-shell';
import { useSession } from '@/components/session';
import { api, useApi } from '@/lib/client';
import { buildOrgTree, groupByTeam, subtreeIds, type OrgNode } from '@/lib/org-tree';

interface Data {
  employees: Array<{ id: string; code: string | null; name: string; role_title: string; app_role: Role; status: string; weekly_hours: number; auth_user_id: string | null; email: string; membership: { role: Role; status: string } | null; team?: string | null; manager_id?: string | null; hired_at?: string | null }>;
  members: Array<{ user_id: string; email: string; role: Role }>;
}
type Tab = 'accounts' | 'teams';

export default function Employees() {
  const [tab, setTab] = useState<Tab>('accounts');
  return (
    <>
      <PageHeader title="Çalışanlar" sub="Hesap bağlantısı · ekipler & hiyerarşi" actions={APP_URL ? <a className="btn" href={`${APP_URL}/app/people`} target="_blank" rel="noreferrer">JS People’da aç →</a> : undefined} />
      <Tabs<Tab> tabs={[['accounts', 'Hesaplar'], ['teams', 'Ekipler & hiyerarşi']]} value={tab} onChange={setTab} />
      {tab === 'accounts' ? <NeedsSupabase><Accounts /></NeedsSupabase> : <Teams />}
    </>
  );
}

function Accounts() {
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

/** Ekipler & hiyerarşi: ekip + yönetici seçimi, org ağacı. Supabase: /api/admin/employees PATCH (servis rolü + denetim); demo: oturumun DemoRepo'su. */
function Teams() {
  const { repo, mode, rev } = useSession();
  const [rows, setRows] = useState<TeamMember[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    if (!repo) return;
    (mode === 'demo' ? repo.team() : api<Data>('/api/admin/employees').then((d) => d.employees.map((e) => ({ id: e.id, org_id: '', name: e.name, role_title: e.role_title, app_role: e.app_role, status: e.status as TeamMember['status'], weekly_hours: e.weekly_hours, team: e.team ?? null, manager_id: e.manager_id ?? null, hired_at: e.hired_at ?? null }))))
      .then((r) => { setRows(r); setErr(null); }, (e: unknown) => setErr(errText(e)));
  }, [repo, mode]);
  useEffect(load, [load, rev]);
  const patch = async (id: string, p: { team?: string | null; manager_id?: string | null }) => {
    try {
      if (mode === 'demo') await repo!.updateEmployee(id, p); else await api('/api/admin/employees', { method: 'PATCH', body: JSON.stringify({ employee_id: id, ...p }) });
      setMsg({ ok: true, text: 'Kaydedildi.' }); load();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const teams = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.team).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, 'tr')), [rows]);
  if (err) return <p role="alert" className="text-sm text-magenta">{err}</p>;
  if (!rows) return <Loading />;
  const active = rows.filter((r) => r.status === 'active');
  const tree = buildOrgTree(active);
  const Node = ({ n }: { n: OrgNode }) => (
    <li><div className="org-node"><strong>{n.name}</strong><span className="text-xs text-muted">{n.role_title}{n.team ? ` · ${n.team}` : ''}</span>{n.children.length > 0 && <span className="chip">{n.children.length}</span>}</div>{n.children.length > 0 && <ul>{n.children.map((c) => <Node key={c.id} n={c} />)}</ul>}</li>
  );
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="card overflow-x-auto">
        <Msg m={msg} />
        <table className="table"><thead><tr><th>Çalışan</th><th>Ekip</th><th>Bağlı olduğu</th><th>İşe giriş</th></tr></thead><tbody>
          {rows.map((e) => { const banned = subtreeIds(rows, e.id); return (
            <tr key={e.id}>
              <td><strong>{e.name}</strong><span className="ml-2 text-xs text-muted">{e.role_title}</span>{e.status !== 'active' && <span className="chip ml-2">Ayrıldı</span>}</td>
              <td><input className="input min-w-32" list="team-list" defaultValue={e.team ?? ''} aria-label={`${e.name} ekibi`} onBlur={(ev) => { const v = ev.target.value.trim() || null; if (v !== (e.team ?? null)) void patch(e.id, { team: v }); }} /></td>
              <td><select className="input min-w-40" aria-label={`${e.name} yöneticisi`} value={e.manager_id ?? ''} onChange={(ev) => void patch(e.id, { manager_id: ev.target.value || null })}>
                <option value="">— (kök)</option>{rows.filter((m) => !banned.has(m.id) && m.status === 'active').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
              <td className="text-xs text-muted">{e.hired_at ?? '—'}</td>
            </tr>
          ); })}
        </tbody></table>
        <datalist id="team-list">{teams.map((t) => <option key={t} value={t} />)}</datalist>
        <p className="mt-3 text-xs text-muted">Yönetici listesi, döngü oluşturacak kişileri (kendisi ve altındakiler) göstermez. Değişiklikler {mode === 'demo' ? 'tarayıcıdaki demo verisine' : 'servis rolüyle yazılır ve denetim kaydına'} düşer. Toplu giriş için kullanıcı uygulamasında Kurulum → Ekip (XLSX).</p>
      </section>
      <div className="grid content-start gap-5">
        <section className="card"><h2 className="mb-2 font-bold">Organizasyon ağacı</h2>{tree.length === 0 ? <p className="text-sm text-muted">Aktif çalışan yok.</p> : <ul className="org-tree">{tree.map((n) => <Node key={n.id} n={n} />)}</ul>}</section>
        <section className="card"><h2 className="mb-2 font-bold">Ekipler</h2><ul className="grid gap-1 text-sm">{groupByTeam(active).map(([t, ps]) => <li key={t} className="nested flex items-center justify-between"><span>{t}</span><span className="chip">{ps.length}</span></li>)}</ul></section>
      </div>
    </div>
  );
}
