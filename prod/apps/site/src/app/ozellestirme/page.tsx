import type { Metadata } from 'next';
import Link from 'next/link';
import { FEATURES, NAV_GROUPS, ROLES, ROLE_LABELS } from '@jscore/contracts';
import { Code, CtaBand, PageHero, Section, StatusChip } from '@/components/ui';
import { IconArrow } from '@/components/icons';
import { CUSTOMIZE } from '@/content/platform';

export const metadata: Metadata = { title: 'Özelleştirme', description: 'Modül/özellik anahtarları, rol bazlı menü ve grup sırası, kurulum ve sektör paketleri, white label, otomasyon kuralları, ajan promptları, karar hakları, bildirim kuralları, kayıtlı görünümler.', alternates: { canonical: '/ozellestirme' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Özelleştirme" title="Kod yazmadan ajansınıza göre biçimlendirin" lede="Hangi modüller açık, hangi rol neyi görür, hangi olay neyi tetikler, ajanlar neye kadar yetkili — hepsi Ana Yönetim Paneli’nden. Kaynak kodda ise her şey tek şemadan (orgSettings) okunur."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><Link href="/urun/yonetim-paneli" className="btn btn-lg">Yönetim Paneli</Link></>} />

      <Section title="Özelleştirilebilir alanlar">
        <div className="grid gap-4 md:grid-cols-2">
          {CUSTOMIZE.map((c) => (
            <article key={c.title} className="card">
              <div className="flex items-start justify-between gap-3"><h3 className="text-lg">{c.title}</h3><StatusChip status={c.status} /></div>
              <p className="mt-1 text-xs text-brand-ink">{c.where}</p>
              <p className="mt-2 text-sm text-muted">{c.desc}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="Özellik anahtarları" title={<>{FEATURES.length} anahtar, modül içinde ince ayar</>} lede="Anahtar yoksa özellik açıktır; false ise düğme/sekme gizlenir. AI işaretli olanlar sunucuda da zorlanır (403 feature_disabled).">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="table">
            <thead><tr><th>Anahtar</th><th>Etiket</th><th>Ne yapar</th><th>Sekme</th></tr></thead>
            <tbody>{FEATURES.map((f) => <tr key={f.key}><td><code className="text-brand-ink">{f.key}</code>{f.agent && <span className="chip chip-ai ml-2" style={{ height: 16, fontSize: 9 }}>AI</span>}</td><td className="whitespace-nowrap">{f.label}</td><td className="text-muted">{f.desc}</td><td className="text-muted">{f.tab ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Gezinme" title="Grup sırası ve rol başına gizleme">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="card">
            <h3 className="text-lg">Dokuz grup, istediğiniz sıra</h3>
            <ol className="mt-3 grid gap-1.5">{NAV_GROUPS.map((g, i) => <li key={g.id} className="nested flex items-center justify-between py-2 text-sm"><span><span className="mr-2 text-muted">{i + 1}</span>{g.label}</span><code className="text-xs text-muted">{g.id}</code></li>)}</ol>
          </div>
          <div className="grid gap-4">
            <div className="card">
              <h3 className="text-lg">14 rol</h3>
              <ul className="mt-3 flex flex-wrap gap-1.5">{ROLES.map((r) => <li key={r} className="chip">{ROLE_LABELS[r]}</li>)}</ul>
              <p className="mt-3 text-sm text-muted">Her rol için gizlenecek modüller seçilir; bir grubun tüm modülleri gizliyse grup düşer. Varsayılanlar contracts’ta tanımlı; panel üzerine yazar.</p>
            </div>
            <Code title="organizations.settings.nav">{`{
  "order": ["home", "inbox", "projects", "production", "clients", "team", "finance", "messages", "apps"],
  "hidden": { "creative": ["finance", "crm"], "freelancer": ["flow", "resources"] }
}`}</Code>
          </div>
        </div>
      </Section>

      <Section eyebrow="Otomasyon" title="Olay → filtre → aksiyon">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="prose">
            <p>Yalnızca <strong>yayındaki</strong> kurallar çalışır. Tetik, olay türüdür (<code>tasks.update</code>, <code>approvals.insert</code>, <code>invoices.update</code>, <code>leaves.update</code> …) + isteğe bağlı eşitlik filtresi (<code>new.state=delivery</code>). Update olaylarında filtrelenen alanın gerçekten <em>değişmesi</em> gerekir.</p>
            <p>Aksiyonlar: görev oluştur, uygulama içi bildirim, görev aşaması değiştir, imzalı webhook gönder. Otomasyonun açtığı görevler yeniden tetiklemez (döngü koruması). Son tetiklenme ve çalıştırma günlüğü panelde.</p>
          </div>
          <Code title="Örnek kural">{`Tetik:   tasks.update
Filtre:  new.state = delivery
Aksiyon: webhook → https://hooks.ajans.example/teslim
         (x-jscore-signature: sha256=…)
Aksiyon: bildirim → operations
         "Teslim edildi: {task.title}"`}</Code>
        </div>
      </Section>
      <CtaBand title="Sektör paketi ya da özel modül mü gerekiyor?" sub="Kurumsal planda özel modüller ve beyaz etiketli dağıtım kurulum hizmetiyle gelir." />
    </>
  );
}
