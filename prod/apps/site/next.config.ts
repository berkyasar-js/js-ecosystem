import type { NextConfig } from 'next';

/**
 * Pazarlama sitesi: tüm sayfalar statik üretilir (SSG). Tek dinamik uç `/api/demo` (demo talebi iletimi)
 * olduğundan `output: 'export'` kullanılmaz; Vercel'de Node çalışma zamanı ile dağıtılır.
 */
const config: NextConfig = {
  transpilePackages: ['@jscore/contracts'],
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
