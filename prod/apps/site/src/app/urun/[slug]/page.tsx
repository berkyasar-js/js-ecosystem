import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductPage } from '@/components/product-page';
import { PRODUCT_PAGES, productPage } from '@/content/product';

export const dynamicParams = false;
export function generateStaticParams() { return PRODUCT_PAGES.map((p) => ({ slug: p.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = productPage((await params).slug);
  if (!p) return {};
  return { title: `${p.eyebrow} — ${p.title}`, description: p.lede, alternates: { canonical: `/urun/${p.slug}` } };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = productPage((await params).slug);
  if (!p) notFound();
  return <ProductPage data={p} />;
}
