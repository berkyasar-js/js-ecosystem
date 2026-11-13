import Link from 'next/link';
import { MODULES, ROLE_LABELS, type Role } from '@jscore/contracts';
import type { ProductPageData } from '@/content/product';
import { PRODUCT_PAGES } from '@/content/product';
import { Mock } from './mockups';
import { CtaBand, Feature, PageHero, Section } from './ui';
import { IconArrow } from './icons';

export function ProductPage({ data }: { data: ProductPageData }) {
  const mods = data.modules.map((id) => MODULES.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  const others = PRODUCT_PAGES.filter((p) => p.slug !== data.slug);
  return (
    <>
      <PageHero eyebrow={data.eyebrow} title={data.title} lede={data.lede}
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><Link href="/moduller" className="btn btn-lg">Modül kataloğu</Link></>}>
        <div className="glow relative mt-12 rounded-[18px]"><Mock kind={data.mock} /></div>
        <p className="mt-3 text-xs text-muted">Uygulamada: <code>{data.route}</code></p>
      </PageHero>

      <Section eyebrow="Neler var" title="Özellikler">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.features.map((f) => <Feature key={f.title} title={f.title} soon={f.soon}>{f.desc}</Feature>)}
        </div>
      </Section>

      <Section eyebrow="Akış" title="Nasıl çalışır">
        <ol className="grid gap-3 md:grid-cols-4">
          {data.flow.map((s, i) => (
            <li key={s.step} className="nested relative pl-12">
              <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
              <span className="block text-sm font-semibold">{s.step}</span>
              <span className="block text-xs text-muted">{s.detail}</span>
            </li>
          ))}
        </ol>
      </Section>

      {(mods.length > 0 || data.roles.length > 0) && (
        <Section>
          <div className="grid gap-6 md:grid-cols-2">
            {mods.length > 0 && (
              <div className="card">
                <h2 className="text-lg">Kapsanan modüller</h2>
                <ul className="mt-3 grid gap-2">{mods.map((m) => <li key={m.id} className="flex items-start justify-between gap-3 text-sm"><Link href={`/moduller#${m.id}`} className="font-semibold hover:underline">{m.name}</Link><span className="text-right text-xs text-muted">{m.desc}</span></li>)}</ul>
              </div>
            )}
            <div className="card">
              <h2 className="text-lg">Kimler görür</h2>
              <p className="mt-1 text-xs text-muted">Varsayılan rol atamaları; panelden rol başına modül gizlenebilir.</p>
              <ul className="mt-3 flex flex-wrap gap-2">{data.roles.map((r) => <li key={r} className="chip chip-brand">{ROLE_LABELS[r as Role] ?? r}</li>)}</ul>
              {data.related.length > 0 && <ul className="mt-5 grid gap-2 border-t border-line pt-4">{data.related.map((r) => <li key={r.href}><Link href={r.href} className="text-sm text-brand-ink hover:underline">{r.label} →</Link></li>)}</ul>}
            </div>
          </div>
        </Section>
      )}

      <Section eyebrow="Diğer alanlar" title="Ürünün geri kalanı">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {others.map((p) => <li key={p.slug}><Link href={`/urun/${p.slug}`} className="nested block h-full transition hover:border-brand-ink/50"><span className="eyebrow">{p.eyebrow}</span><span className="mt-1 block text-sm font-semibold">{p.title}</span></Link></li>)}
        </ul>
      </Section>
      <CtaBand />
    </>
  );
}
