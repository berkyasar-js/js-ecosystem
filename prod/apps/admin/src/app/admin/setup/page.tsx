'use client';
import { useState } from 'react';
import { DEFAULT_SETUP, SETUP_PACKS, setupStateSchema } from '@jscore/contracts';
import { Async, PageHeader } from '@/components/ui';
import { Msg, errText } from '@/components/admin-ui';
import { SetupCard } from '@/components/setup-card';
import { useAdminSettings } from '@/lib/client';

/** Kurulum & Çalışma Alanı: adım durumu, "Devam et" (kullanıcı uygulamasındaki sihirbaz), yeniden açma. */
export default function SetupPage() {
  const st = useAdminSettings();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = setupStateSchema.safeParse(st.settings?.setup ?? DEFAULT_SETUP);
  const setup = s.success ? s.data : DEFAULT_SETUP;
  const reopen = async () => {
    try { await st.save({ setup: { ...setup, completed_at: null, reopened: setup.reopened + 1, step: 'org' } }); setMsg({ ok: true, text: 'Kurulum yeniden açıldı; Ana Sayfa’daki kart geri geldi.' }); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const reset = async () => {
    if (!confirm('Kurulum ilerlemesi sıfırlansın mı? (Ayarlar, çalışanlar ve modül anahtarları silinmez; yalnızca adım işaretleri temizlenir.)')) return;
    try { await st.save({ setup: { ...DEFAULT_SETUP, reopened: setup.reopened + 1 } }); setMsg({ ok: true, text: 'Kurulum sıfırlandı.' }); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  return (
    <>
      <PageHeader title="Kurulum & Çalışma Alanı" sub="İlk çalıştırma sihirbazının durumu; adımlar kullanıcı uygulamasında (/app/setup) tamamlanır" />
      <Msg m={msg} />
      <Async q={{ data: st.settings, error: st.error, loading: st.loading }}>{(settings) => (
        <div className="grid max-w-4xl gap-5">
          <SetupCard settings={settings} />
          <section className="card grid gap-2 text-sm">
            <h2 className="font-bold">Özet</h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="nested"><dt className="text-xs text-muted">Organizasyon</dt><dd className="font-semibold">{settings.general.name} · {settings.general.timezone} · {settings.general.currency} · {settings.structure.work_hours}</dd></div>
              <div className="nested"><dt className="text-xs text-muted">Seçilen paketler</dt><dd className="font-semibold">{setup.packs.length ? setup.packs.map((p) => SETUP_PACKS.find((x) => x.id === p)?.label ?? p).join(', ') : '—'}</dd></div>
              <div className="nested"><dt className="text-xs text-muted">Tamamlanma</dt><dd className="font-semibold">{setup.completed_at ? setup.completed_at.slice(0, 16).replace('T', ' ') : 'Devam ediyor'}</dd></div>
              <div className="nested"><dt className="text-xs text-muted">Yeniden açılma</dt><dd className="font-semibold">{setup.reopened}</dd></div>
            </dl>
          </section>
          <section className="card flex flex-wrap items-center gap-3">
            <button className="btn" onClick={() => void reopen()} disabled={!setup.completed_at}>Kurulumu yeniden aç</button>
            <button className="btn" onClick={() => void reset()}>İlerlemeyi sıfırla</button>
            <p className="text-xs text-muted">Sihirbaz organizasyon ayarları, çalışan kayıtları, modül paketleri (feature_flags), HubSpot token’ı (integrations.config, maskeli) ve ilk marka/proje adımlarını yürütür; her adım denetim kaydına yazılır.</p>
          </section>
        </div>
      )}</Async>
    </>
  );
}
