import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, CtaBand, Faq, PageHero, Section } from '@/components/ui';
import { IconArrow, IconCheck, IconX } from '@/components/icons';
import { COMPARE, PLANS, PRICING_FAQ } from '@/content/platform';

export const metadata: Metadata = { title: 'Fiyatlandırma', description: 'Başlangıç ₺490, Ajans ₺890 koltuk/ay, Kurumsal teklif. Lansman fiyatı, KDV hariç. Karşılaştırma tablosu, kendi sunucunda kurulum ve SSS.', alternates: { canonical: '/fiyatlandirma' } };

const Cell = ({ v }: { v: string | boolean }) => (typeof v === 'string' ? <span className="text-sm">{v}</span> : v ? <span className="tick"><IconCheck size={11} /></span> : <span className="cross"><IconX size={10} /></span>);

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Fiyatlandırma" title="Koltuk başına, sade" lede="Üç plan. Fiyatlar lansman fiyatıdır, TRY cinsinden ve KDV hariçtir. Yıllık ödemede %20 indirim. Kapalı modüller faturaya yansımaz.">
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <article key={p.id} className={`card flex flex-col gap-4 ${p.highlight ? 'glow border-brand-ink/50' : ''}`} aria-label={`${p.name} planı`}>
              <div className="flex items-center justify-between"><h2 className="text-xl">{p.name}</h2>{p.highlight && <span className="chip chip-lime">Popüler</span>}</div>
              <div><p className="text-4xl font-bold">{p.price}<span className="text-sm font-medium text-muted">{p.unit}</span></p><p className="mt-1 text-xs text-muted">{p.minSeats} · lansman fiyatı, KDV hariç</p></div>
              <p className="text-sm text-muted">{p.blurb}</p>
              <ul className="grid gap-2">{p.includes.map((x) => <Check key={x}>{x}</Check>)}</ul>
              <Link href={p.cta.href} className={`btn mt-auto ${p.highlight ? 'btn-primary' : ''}`}>{p.cta.label} <IconArrow size={14} /></Link>
              <p className="text-[11px] text-muted">Panelde plan kodu: {p.adminCode}</p>
            </article>
          ))}
        </div>
      </PageHero>

      <Section eyebrow="Karşılaştırma" title="Planlar yan yana">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="table min-w-[720px]">
            <thead><tr><th className="w-[46%]">Özellik</th>{PLANS.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead>
            <tbody>
              {COMPARE.map((g) => (
                <GroupRows key={g.group} group={g.group} rows={g.rows} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="on-prem" eyebrow="Kendi sunucunda kur" title="Lisans + kurulum hizmeti" lede="JS Workspace açık kaynak değildir. Kendi Vercel/Supabase hesabınıza ya da VPC’nize, sizin anahtarlarınızla kurulur; kod lisanslı olarak teslim edilir.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card"><h3 className="text-lg">Kapsam</h3><ul className="mt-3 grid gap-2"><Check>Üç uygulama (web, admin, REA) ve migration’lar</Check><Check>Supabase projesi, auth sağlayıcıları, Storage kovaları</Check><Check>Vercel projeleri, cron’lar, alan adları</Check><Check>İlk içe aktarma (Trello, ekip XLSX)</Check></ul></div>
          <div className="card"><h3 className="text-lg">Siz sağlarsınız</h3><ul className="mt-3 grid gap-2"><Check>Supabase ve Vercel hesapları (ya da eşdeğer altyapı)</Check><Check>Anthropic API anahtarı (ajan maliyeti size faturalanır)</Check><Check>Trello / HubSpot / Google OAuth kimlikleri</Check></ul></div>
          <div className="card"><h3 className="text-lg">Fiyat</h3><p className="mt-3 text-3xl font-bold">Teklif</p><p className="mt-2 text-sm text-muted">Yıllık lisans (koltuk bandına göre) + tek seferlik kurulum. Güncellemeler lisans süresince dahildir; isteğe bağlı bakım SLA’sı.</p><Link href="/iletisim" className="btn mt-4">Teklif isteyin</Link></div>
        </div>
      </Section>

      <Section eyebrow="SSS" title="Fiyatlandırma soruları"><div className="max-w-3xl"><Faq items={PRICING_FAQ} /></div></Section>
      <CtaBand />
    </>
  );
}

function GroupRows({ group, rows }: { group: string; rows: Array<{ label: string; values: [string | boolean, string | boolean, string | boolean] }> }) {
  return (
    <>
      <tr><th colSpan={4} className="bg-nested text-brand-ink">{group}</th></tr>
      {rows.map((r) => <tr key={r.label}><td>{r.label}</td>{r.values.map((v, i) => <td key={i}><Cell v={v} /></td>)}</tr>)}
    </>
  );
}
