import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

/**
 * rea-agents, bağımlılıklarını çalışma zamanında dinamik olarak yükler; Next'in statik izlemesi bunları göremez
 * ("Cannot find package 'canonicalize'"). Bu yüzden rea-agents'ın geçişli bağımlılık kapanışı hesaplanıp
 * analiz fonksiyonunun paketine açıkça eklenir. `frida` (isteğe bağlı, ~110 MB yerel ikili) dışarıda bırakılır;
 * JS uygulama analizi için gerekmez ve Lambda 250 MB sınırını aşardı.
 */
const EXCLUDED = new Set(['frida']);
function reaDependencyClosure(): string[] {
  const start = path.join(__dirname, '../../node_modules/rea-agents');
  if (!fs.existsSync(path.join(start, 'package.json'))) return [];
  const seen = new Set<string>();
  const resolveFrom = (name: string, from: string): string | null => {
    let d = from;
    for (;;) {
      const c = path.join(d, 'node_modules', name);
      if (fs.existsSync(path.join(c, 'package.json'))) return c;
      const up = path.dirname(d);
      if (up === d) return null;
      d = up;
    }
  };
  const walk = (dir: string) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    for (const n of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      if (EXCLUDED.has(n)) continue;
      const r = resolveFrom(n, dir);
      if (r) walk(r);
    }
  };
  walk(start);
  return [...seen].map((d) => path.relative(__dirname, d).split(path.sep).join('/') + '/**/*');
}

const config: NextConfig = {
  poweredByHeader: false,
  // REA CLI ve asar paketlenmez, çalışma zamanında node_modules'tan okunur (child_process ile çalıştırılır).
  serverExternalPackages: ['rea-agents', '@electron/asar'],
  // Monorepo: izleme kökü repo kökü; REA'nın tüm dosyaları analiz fonksiyonlarının paketine dahil edilir.
  // Vercel'de depo kökü `prod/`un bir üstüdür (prod/apps/rea); izleme kökü depo köküyle eşleşmeli,
  // yoksa izlenen yollar /vercel/path0/apps/rea gibi yanlış çözülür (MODULE_NOT_FOUND).
  outputFileTracingRoot: path.join(__dirname, process.env.VERCEL ? '../../..' : '../..'),
  outputFileTracingIncludes: {
    '/api/projects/[id]/run': ['../../node_modules/@electron/asar/**/*', ...reaDependencyClosure()],
  },
  outputFileTracingExcludes: {
    '/api/projects/[id]/run': ['../../node_modules/frida/**/*'],
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
