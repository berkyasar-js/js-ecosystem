import type { Metadata } from 'next';
import Link from 'next/link';
import { ADMIN_ONLY_MODULES, FEATURES, GROUP_LABELS, MODULES, ROLE_LABELS, ROLE_MODULES, ROLES, SETUP_PACKS, navGroupOf, NAV_GROUPS, type ModuleGroup } from '@jscore/contracts';
import { CtaBand, PageHero, Section } from '@/components/ui';
import { IconArrow } from '@/components/icons';

export const metadata: Metadata = { title: 'Modül kataloğu', description: 'JS Workspace modülleri: açıklama, özellik anahtarları, kurulum paketi ve hangi rollerin gördüğü. Katalog uygulamanın contracts paketinden üretilir.', alternates: { canonical: '/moduller' } };

const ORDER: ModuleGroup[] = ['main', 'work', 'creative', 'people', 'intel', 'manage'];
const GROUP_TITLES: Record<ModuleGroup, string> = { main: 'Ana menü', work: 'Ajans operasyonu', creative: 'Üretim & medya', people: 'İnsan & müşteri', intel: 'Zekâ', manage: 'Yönetim & sistem', hidden: '' };

export default function Page() {
  const visible = MODULES.filter((m) => m.group !== 'hidden');
  const packOf = (id: string) => SETUP_PACKS.filter((p) => p.modules.includes(id));
  const rolesOf = (id: string) => ROLES.filter((r) => ROLE_MODULES[r].includes(id));
  return (
    <>
      <PageHero eyebrow="Modüller" title={<>{visible.length} modül, panelden tek tek açılır</>} lede="Bu katalog uygulamanın kaynak kodundaki modül tanımından (contracts → MODULES, FEATURES, SETUP_PACKS, ROLE_MODULES) üretilir; pazarlama metni değil, çalışan ürünün listesidir."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><Link href="/ozellestirme" className="btn btn-lg">Özellik anahtarları</Link></>}>
        <nav className="mt-10 flex flex-wrap gap-2" aria-label="Gruplar">{ORDER.map((g) => <a key={g} href={`#g-${g}`} className="chip" style={{ height: 30, fontSize: 12, padding: '0 14px' }}>{GROUP_TITLES[g]} · {visible.filter((m) => m.group === g).length}</a>)}</nav>
      </PageHero>

      <Section eyebrow="Kurulum paketleri" title="Beş paket, tek tıkla modül seti" lede="Kurulum sihirbazının 3. adımı: seçilen paketlerin modülleri açılır, seçilmeyenlerinki kapanır, paketsiz modüllere dokunulmaz.">
        <div className="grid gap-3 md:grid-cols-5">{SETUP_PACKS.map((p) => <div key={p.id} className="nested"><div className="text-sm font-semibold">{p.label}</div><div className="mt-1 text-xs text-muted">{p.desc}</div><div className="mt-2 flex flex-wrap gap-1">{p.modules.map((m) => <span key={m} className="chip" style={{ fontSize: 10 }}>{m}</span>)}</div></div>)}</div>
      </Section>

      {ORDER.map((g) => {
        const mods = visible.filter((m) => m.group === g);
        return (
          <Section key={g} id={`g-${g}`} eyebrow={GROUP_LABELS[g]} title={GROUP_TITLES[g]}>
            <div className="grid gap-4 md:grid-cols-2">
              {mods.map((m) => {
                const feats = FEATURES.filter((f) => f.module === m.id);
                const packs = packOf(m.id);
                const roles = rolesOf(m.id);
                const nav = navGroupOf(m.id);
                const adminOnly = (ADMIN_ONLY_MODULES as readonly string[]).includes(m.id);
                return (
                  <article key={m.id} id={m.id} className="card scroll-mt-28 flex flex-col gap-3">
                    <header className="flex flex-wrap items-start justify-between gap-2">
                      <div><h3 className="text-lg">{m.name}</h3><code className="text-xs text-muted">/app/{m.slug}</code></div>
                      <div className="flex gap-1.5">{adminOnly ? <span className="chip chip-brand">Yönetim Paneli</span> : <span className="chip chip-ok">Canlı</span>}{nav && <span className="chip">{NAV_GROUPS.find((n) => n.id === nav)?.label}</span>}</div>
                    </header>
                    <p className="text-sm text-muted">{m.desc}</p>
                    {feats.length > 0 && (
                      <div><div className="eyebrow mb-1.5">Özellik anahtarları</div><ul className="flex flex-wrap gap-1.5">{feats.map((f) => <li key={f.key} className="chip" title={f.desc}>{f.label}{f.agent && <span className="chip chip-ai" style={{ height: 16, fontSize: 9, padding: '0 6px' }}>AI</span>}</li>)}</ul></div>
                    )}
                    <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                      <div><span className="eyebrow block mb-1">Paket</span>{packs.length ? packs.map((p) => p.label).join(', ') : 'Çekirdek (her zaman açık ya da paketsiz)'}</div>
                      <div><span className="eyebrow block mb-1">Gören roller ({roles.length})</span>{roles.map((r) => ROLE_LABELS[r]).join(' · ')}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </Section>
        );
      })}

      <Section eyebrow="Not" title="Katalog nasıl okunur">
        <div className="prose max-w-3xl">
          <ul>
            <li><strong>Canlı</strong>: kullanıcı uygulamasında, Demo ve Supabase depolarında çalışır. <strong>Yönetim Paneli</strong>: yalnızca owner / org_admin için ayrı uygulamada yaşar.</li>
            <li><strong>Özellik anahtarları</strong> kapalıyken ilgili düğme/sekme gizlenir; <span className="chip chip-ai" style={{ height: 16, fontSize: 9 }}>AI</span> işaretli olanlar sunucuda da reddedilir.</li>
            <li><strong>Gören roller</strong> varsayılan atamadır; panelden rol başına modül gizlenebilir, modül tamamen kapatılabilir. Ana Sayfa, Profil, Uygulamalar ve Onaylar kapatılamaz.</li>
          </ul>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
