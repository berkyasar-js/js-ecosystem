'use client';
import { Avatar } from '@/components/avatar';
import { MODULES, ROLE_LABELS, canAccessModule, hasPermission } from '@jscore/contracts';
import { PageHeader } from '@/components/ui';
import { useSession } from '@/components/session';

const CHECKS: Array<[string, string, string, string]> = [
  ['Görev güncelle', 'work', 'task', 'update'], ['Onay karara bağla', 'core', 'approval', 'decide'],
  ['Bordro oku', 'payroll', 'salary', 'read'], ['Özlük arşivi oku', 'hr', 'hr_archive', 'read'], ['Entegrasyon yönet', 'connect', 'integration', 'write'],
];

export default function Profile() {
  const { me, orgs, orgId, theme, toggleTheme, logout, mode } = useSession();
  if (!me) return null;
  const extra = me.scopes.flatMap((s) => (s === 'can.read.hr_archive' ? ['hr:hr_archive:*'] : s === 'can.read.payroll' ? ['payroll:*:*'] : []));
  return (
    <>
      <PageHeader title="Profilim" sub="Kapsam, yetkiler ve tercihler" />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center gap-4"><Avatar id={me.employee_id || me.id} name={me.name} size="lg" />
            <div><h2 className="text-lg font-bold">{me.name}</h2><p className="text-sm text-muted">{me.title}</p><p className="text-xs text-muted">{me.email}</p></div></div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="nested"><dt className="text-xs text-muted">Rol</dt><dd className="font-semibold">{ROLE_LABELS[me.role]}</dd></div>
            <div className="nested"><dt className="text-xs text-muted">Organizasyon</dt><dd className="font-semibold">{orgs.find((o) => o.id === orgId)?.name}</dd></div>
            <div className="nested"><dt className="text-xs text-muted">Erişilebilir modül</dt><dd className="font-semibold">{MODULES.filter((m) => canAccessModule(me.role, m.id)).length}</dd></div>
            <div className="nested"><dt className="text-xs text-muted">Veri kaynağı</dt><dd className="font-semibold">{mode === 'demo' ? 'Demo (yerel)' : 'Supabase (RLS)'}</dd></div>
          </dl>
          <div className="mt-5 flex gap-2"><button className="btn" onClick={toggleTheme}>Tema: {theme === 'dark' ? 'Koyu' : 'Açık'}</button><button className="btn" onClick={() => void logout()}>Çıkış yap</button></div>
        </section>
        <section className="card">
          <h2 className="mb-3 font-bold">Yetki özeti</h2>
          <ul className="grid gap-2">{CHECKS.map(([label, p, r, a]) => {
            const ok = hasPermission(me.role, p, r, a, extra);
            return <li key={label} className="nested flex items-center justify-between"><span>{label}</span><span className={`chip ${ok ? 'chip-ok' : 'chip-bad'}`}>{ok ? 'İzinli' : 'Yok'}</span></li>;
          })}</ul>
          <p className="mt-3 text-xs text-muted">Owner/Org Admin, bordro ve özlük arşivine varsayılan olarak erişemez; ayrı yetki gerekir.</p>
        </section>
      </div>
    </>
  );
}
