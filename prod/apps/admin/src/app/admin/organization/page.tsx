'use client';
import { useEffect, useState } from 'react';
import type { OrgSettings } from '@jscore/contracts';
import { Async, PageHeader } from '@/components/ui';
import { Msg, errText } from '@/components/admin-ui';
import { useSession } from '@/components/session';
import { useAdminSettings } from '@/lib/client';

export default function Organization() {
  const st = useAdminSettings();
  const { mode, resetDemo } = useSession();
  const [g, setG] = useState<OrgSettings['general'] | null>(null);
  const [slug, setSlug] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (st.settings) { setG(st.settings.general); setSlug(st.slug); } }, [st.settings, st.slug]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!g) return;
    try { await st.save({ general: g }, mode === 'supabase' && slug !== st.slug ? slug : undefined); setMsg({ ok: true, text: 'Kaydedildi.' }); } catch (er) { setMsg({ ok: false, text: errText(er) }); }
  };
  return (
    <>
      <PageHeader title="Organizasyon" sub="Ad, slug, dil, logo, veri dökümü" />
      <Msg m={msg} />
      <Async q={{ data: st.settings, error: st.error, loading: st.loading }}>{() => g && (
        <div className="grid max-w-3xl gap-5">
          <form className="card grid gap-4" onSubmit={save}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label" htmlFor="on">Organizasyon adı</label><input id="on" className="input" required value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></div>
              <div><label className="label" htmlFor="os">Slug</label><input id="os" className="input" value={slug} disabled={mode === 'demo'} pattern="[a-z0-9][a-z0-9-]{1,48}" onChange={(e) => setSlug(e.target.value.toLowerCase())} /></div>
              <div><label className="label" htmlFor="ol">Dil</label><input id="ol" className="input" value={g.locale} onChange={(e) => setG({ ...g, locale: e.target.value })} /></div>
              <div><label className="label" htmlFor="otz">Saat dilimi</label><input id="otz" className="input" value={g.timezone} onChange={(e) => setG({ ...g, timezone: e.target.value })} /></div>
              <div><label className="label" htmlFor="oc">Para birimi</label><input id="oc" className="input" value={g.currency} onChange={(e) => setG({ ...g, currency: e.target.value })} /></div>
              <div><label className="label" htmlFor="ologo">Logo URL’si (https)</label><input id="ologo" type="url" className="input" placeholder="https://…/logo.svg" value={g.logo_url ?? ''} onChange={(e) => setG({ ...g, logo_url: e.target.value })} /></div>
            </div>
            {g.logo_url && /^https:\/\//.test(g.logo_url) && <img src={g.logo_url} alt="Logo önizleme" className="h-10 w-auto self-start rounded bg-white/5 p-1" />}
            <button className="btn btn-primary w-fit">Kaydet</button>
          </form>
          {mode === 'demo' && (
            <section className="card"><h2 className="font-bold">Demo verisini sıfırla</h2><p className="mt-1 text-sm text-muted">Tarayıcıdaki demo verisini (localStorage) ilk haline döndürür.</p>
              <button className="btn mt-3" onClick={() => { if (confirm('Demo verisi sıfırlansın mı?')) { resetDemo(); setMsg({ ok: true, text: 'Demo verisi sıfırlandı.' }); } }}>Demo’yu sıfırla</button></section>
          )}
          <section className="card border-magenta/40"><h2 className="font-bold text-magenta">Tehlikeli bölge</h2>
            <p className="mt-1 text-sm text-muted">Organizasyon verisini JSON olarak dışa aktar. Sırlar (entegrasyon anahtarları, token özetleri), maaş ve özlük arşivi dahil edilmez. Her dışa aktarma denetim kaydına yazılır.</p>
            {mode === 'supabase' ? <a className="btn mt-3 inline-flex" href="/api/admin/export" download>JSON dışa aktar</a> : <p className="mt-2 text-xs text-muted">Dışa aktarma Supabase bağlıyken çalışır.</p>}
          </section>
        </div>
      )}</Async>
    </>
  );
}
