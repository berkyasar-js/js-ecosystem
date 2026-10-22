import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'JS Ana Yönetim Paneli', description: 'Jobs Studio · JS Ecosystem yönetim paneli', icons: { icon: '/brand/favicon.svg' }, robots: { index: false, follow: false } };
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
