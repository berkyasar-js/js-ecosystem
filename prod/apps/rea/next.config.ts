import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  poweredByHeader: false,
  // REA CLI ve asar paketlenmez, çalışma zamanında node_modules'tan okunur (child_process ile çalıştırılır).
  serverExternalPackages: ['rea-agents', '@electron/asar'],
  // Monorepo: izleme kökü repo kökü; REA'nın tüm dosyaları analiz fonksiyonlarının paketine dahil edilir.
  // Vercel'de depo kökü `prod/`un bir üstüdür (prod/apps/rea); izleme kökü depo köküyle eşleşmeli,
  // yoksa izlenen yollar /vercel/path0/apps/rea gibi yanlış çözülür (MODULE_NOT_FOUND).
  outputFileTracingRoot: path.join(__dirname, process.env.VERCEL ? '../../..' : '../..'),
  outputFileTracingIncludes: {
    '/api/projects/[id]/run': ['../../node_modules/rea-agents/**/*', '../../node_modules/@electron/asar/**/*'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default config;
