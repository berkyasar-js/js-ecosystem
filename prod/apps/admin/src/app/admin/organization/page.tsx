'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { MODULES, NAV_GROUPS, ROLES, ROLE_LABELS, canAccessModule, isAdminOnlyModule, type NavSettings, type OrgSettings, type Role } from '@jscore/contracts';
import { Async, PageHeader, Tabs } from '@/components/ui';
import { Msg, errText } from '@/components/admin-ui';
import { useSession } from '@/components/session';
import { useAdminSettings } from '@/lib/client';

type Tab = 'general' | 'nav' | 'data';

export default function Organization() {
  const st = useAdminSettings();
  const { mode, resetDemo } = useSession();
  const [tab, setTab] = useState<Tab>('general');
  const [g, setG] = useState<OrgSettings['general'] | null>(null);
  const [hours, setHours] = useState('09:00-18:00');
  const [slug, setSlug] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (st.settings) { setG(st.settings.general); setSlug(st.slug); setHours(st.settings.structure?.work_hours ?? '09:00-18:00'); } }, [st.settings, st.slug]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!g || !st.settings) return;
    try { await st.save({ general: g, structure: { ...st.settings.structure, work_hours: hours } }, mode === 'supabase' && slug !== st.slug ? slug : undefined); setMsg({ ok: true, text: 'Kaydedildi.' }); } catch (er) { setMsg({ ok: false, text: errText(er) }); }
  };
  return (
    <>
      <PageHeader title="Organizasyon" sub="Ad, logo, saat dilimi, para birimi, çalışma saatleri, gezinme düzeni, veri dökümü" />
      <Tabs<Tab> tabs={[['general', 'Genel'], ['nav', 'Gezinme'], ['data', 'Veri']]} value={tab} onChange={setTab} />
      <Msg m={msg} />
      <Async q={{ data: st.settings, error: st.error, loading: st.loading }}>{(settings) => (
        <div className="grid max-w-3xl gap-5">
          {tab === 'general' && g && (
            <form className="card grid gap-4" onSubmit={save}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="on">Organizasyon adı</label><input id="on" className="input" required value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></div>
                <div><label className="label" htmlFor="os">Slug</label><input id="os" className="input" value={slug} disabled={mode === 'demo'} pattern="[a-z0-9][a-z0-9-]{1,48}" onChange={(e) => setSlug(e.target.value.toLowerCase())} /></div>
                <div><label className="label" htmlFor="ol">Dil</label><input id="ol" className="input" value={g.locale} onChange={(e) => setG({ ...g, locale: e.target.value })} /></div>
                <div><label className="label" htmlFor="otz">Saat dilimi</label><input id="otz" className="input" value={g.timezone} onChange={(e) => setG({ ...g, timezone: e.target.value })} /></div>
                <div><label className="label" htmlFor="oc">Para birimi</label><input id="oc" className="input" value={g.currency} onChange={(e) => setG({ ...g, currency: e.target.value.toUpperCase() })} /></div>
                <div><label className="label" htmlFor="oh">Çalışma saatleri</label><input id="oh" className="input" pattern="\d{2}:\d{2}-\d{2}:\d{2}" placeholder="09:00-18:00" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor="ologo">Logo URL’si (https) — kullanıcı uygulamasının kenar çubuğunda görünür</label><input id="ologo" type="url" className="input" placeholder="https://…/logo.svg" value={g.logo_url ?? ''} onChange={(e) => setG({ ...g, logo_url: e.target.value })} /></div>
              </div>
              {g.logo_url && /^https:\/\//.test(g.logo_url) && <img src={g.logo_url} alt="Logo önizleme" className="h-10 w-auto self-start rounded bg-white/5 p-1" />}
              <button className="btn btn-primary w-fit">Kaydet</button>
            </form>
          )}
          {tab === 'nav' && <NavEditor nav={settings.nav ?? {}} onSave={async (nav) => { try { await st.save({ nav }); setMsg({ ok: true, text: 'Gezinme düzeni kaydedildi; kullanıcı uygulamasında bir sonraki yenilemede etkin.' }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } }} />}
          {tab === 'data' && (
            <>
              {mode === 'demo' && (
                <section className="card"><h2 className="font-bold">Demo verisini sıfırla</h2><p className="mt-1 text-sm text-muted">Tarayıcıdaki demo verisini (localStorage) ilk haline döndürür.</p>
                  <button className="btn mt-3" onClick={() => { if (confirm('Demo verisi sıfırlansın mı?')) { resetDemo(); setMsg({ ok: true, text: 'Demo verisi sıfırlandı.' }); } }}>Demo’yu sıfırla</button></section>
              )}
              <section className="card border-magenta/40"><h2 className="font-bold text-magenta">Tehlikeli bölge</h2>
                <p className="mt-1 text-sm text-muted">Organizasyon verisini JSON olarak dışa aktar. Sırlar (entegrasyon anahtarları, token özetleri), maaş ve özlük arşivi dahil edilmez. Her dışa aktarma denetim kaydına yazılır.</p>
                {mode === 'supabase' ? <a className="btn mt-3 inline-flex" href="/api/admin/export" download>JSON dışa aktar</a> : <p className="mt-2 text-xs text-muted">Dışa aktarma Supabase bağlıyken çalışır.</p>}
              </section>
            </>
          )}
        </div>
      )}</Async>
    </>
  );
}

/** Gezinme düzenleyici: grup sırası (yukarı/aşağı) + rol başına gizlenen modüller. settings.nav'a yazılır; kullanıcı uygulaması visibleNavGroups ile uygular. */
function NavEditor({ nav, onSave }: { nav: NavSettings; onSave(n: NavSettings): Promise<void> }) {
  const base = NAV_GROUPS.map((g) => g.id);
  const [order, setOrder] = useState<string[]>(() => [...(nav.order ?? []).filter((id) => base.includes(id as never)), ...base.filter((id) => !(nav.order ?? []).includes(id))]);
  const [hidden, setHidden] = useState<Record<string, string[]>>(nav.hidden ?? {});
  const [role, setRole] = useState<Role>('creative');
  const [busy, setBusy] = useState(false);
  const roleMods = useMemo(() => MODULES.filter((m) => !isAdminOnlyModule(m.id) && m.id !== 'apps' && m.id !== 'profile' && canAccessModule(role, m.id) && NAV_GROUPS.some((g) => g.modules.includes(m.id))), [role]);
  const move = (i: number, d: -1 | 1) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const toggle = (id: string) => setHidden((h) => { const cur = new Set(h[role] ?? []); if (cur.has(id)) cur.delete(id); else cur.add(id); return { ...h, [role]: Array.from(cur) }; });
  return (
    <div className="grid gap-5">
      <section className="card grid gap-3">
        <h2 className="font-bold">Grup sırası</h2>
        <p className="text-sm text-muted">Kullanıcı uygulamasının kenar çubuğundaki üst alanların sırası. Tüm modülleri kapalı/gizli olan grup kendiliğinden düşer.</p>
        <ol className="grid gap-2">
          {order.map((id, i) => { const g = NAV_GROUPS.find((x) => x.id === id)!; return (
            <li key={id} className="nav-editor-row"><span className="setup-dot">{i + 1}</span><span className="flex-1 font-semibold">{g.label}</span><span className="text-xs text-muted">{g.modules.length} modül</span>
              <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${g.label} yukarı`}><ArrowUp size={14} /></button>
              <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`${g.label} aşağı`}><ArrowDown size={14} /></button></li>
          ); })}
        </ol>
      </section>
      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Role göre gizlenen modüller</h2>
          <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Rol">{ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
        <p className="text-sm text-muted">Rolün yetkisi olduğu hâlde menüde görmesini istemediğin modüller. Yetkiyi değiştirmez; yalnızca gezinmeden gizler (rota doğrudan açılabilir).</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {roleMods.map((m) => { const off = (hidden[role] ?? []).includes(m.id); return (
            <li key={m.id}><label className="nav-editor-row cursor-pointer text-sm"><input type="checkbox" checked={!off} onChange={() => toggle(m.id)} /> <span className="flex-1">{m.name}</span>{off && <span className="chip">gizli</span>}</label></li>
          ); })}
        </ul>
      </section>
      <button className="btn btn-primary w-fit" disabled={busy} onClick={() => { setBusy(true); void onSave({ order, hidden: Object.fromEntries(Object.entries(hidden).filter(([, v]) => v.length)) }).finally(() => setBusy(false)); }}>Gezinmeyi kaydet</button>
    </div>
  );
}
