import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'JS Ecosystem', description: 'Jobs Studio ajans işletim sistemi', icons: { icon: '/brand/favicon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#080a17' };

const themeInit = `try{var t=localStorage.getItem('js_theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>{children}</body>
    </html>
  );
}
