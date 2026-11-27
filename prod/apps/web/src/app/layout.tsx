import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'JS Ecosystem', description: 'Jobs Studio ajans işletim sistemi', icons: { icon: '/brand/favicon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#171b22' };

// Kayıtlı tercih yoksa açık tema (Atelier: birincil sunum teması); kayıtlı tercih korunur.
const themeInit = `try{document.documentElement.dataset.theme=localStorage.getItem('js_theme')||'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>{children}</body>
    </html>
  );
}
