import type { MetadataRoute } from 'next';
import { PRODUCT_PAGES } from '@/content/product';
import { SITE } from '@/content/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const paths = ['/', '/urun', ...PRODUCT_PAGES.map((p) => `/urun/${p.slug}`), '/moduller', '/entegrasyonlar', '/mcp', '/ozellestirme', '/fiyatlandirma', '/guvenlik', '/sss', '/demo', '/hakkinda', '/iletisim'];
  return paths.map((p) => ({ url: `${SITE.url}${p}`, lastModified: now, changeFrequency: p === '/' ? 'weekly' : 'monthly', priority: p === '/' ? 1 : p.startsWith('/urun') || p === '/fiyatlandirma' ? 0.8 : 0.6 }));
}
