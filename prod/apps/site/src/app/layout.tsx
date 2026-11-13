import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { SITE } from '@/content/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: 'Projeler, müşteriler, üretim, ekip ve finans tek çalışma alanında; dokuz kişilik yapay zekâ yönetim kurulu, Trello iki yönlü senkron, MCP ve rol bazlı güvenlik. Ajanslar için JS Workspace.',
  applicationName: SITE.name,
  keywords: ['ajans yazılımı', 'proje yönetimi', 'ajans CRM', 'yapay zekâ kurul', 'Trello geçiş', 'MCP', 'ajans ERP', 'JS Workspace', 'Jobs Studio'],
  openGraph: { type: 'website', locale: 'tr_TR', siteName: SITE.name, title: `${SITE.name} — ${SITE.tagline}`, description: 'Ajanslar için yapay zekâ destekli çalışma alanı.', images: [{ url: '/og.svg', width: 1200, height: 630, alt: SITE.name }] },
  twitter: { card: 'summary_large_image', title: SITE.name, description: SITE.tagline, images: ['/og.svg'] },
  icons: { icon: '/brand/favicon.svg' },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#080a17' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh">
        <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas">İçeriğe atla</a>
        <Header />
        <main id="icerik">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
