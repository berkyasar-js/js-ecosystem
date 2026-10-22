import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn(async (host: string) => (host === 'gizli.test' ? [{ address: '10.0.0.7', family: 4 }] : [{ address: '93.184.216.34', family: 4 }])) },
}));

import { collectSite, guardedFetch } from '../rea/site';

const PAGES: Record<string, { status?: number; type?: string; body?: string; location?: string }> = {
  'https://ornek.com/': { type: 'text/html', body: '<script src="/_next/static/app.js"></script><script src="https://cdn.x.com/lib.js"></script><script>fetch("/api/x")</script>' },
  'https://ornek.com/_next/static/app.js': { type: 'text/javascript', body: 'load("/_next/static/chunks/c1.js"); fetch("/api/save")' },
  'https://ornek.com/_next/static/chunks/c1.js': { type: 'text/javascript', body: 'WebSocket("wss://ornek.com/ws")' },
  'https://cdn.x.com/lib.js': { type: 'text/javascript', body: 'var a=1' },
  'https://ornek.com/yonlendir': { status: 302, location: 'http://gizli.test/x' },
  'http://gizli.test/x': { type: 'text/html', body: 'sır' },
};

let work: string;
beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'rea-site-'));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const p = PAGES[url];
    if (!p) return new Response('yok', { status: 404 });
    return new Response(p.body ?? '', { status: p.status ?? 200, headers: { 'content-type': p.type ?? 'text/plain', ...(p.location ? { location: p.location } : {}) } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); fs.rmSync(work, { recursive: true, force: true }); });

describe('collectSite', () => {
  it('sayfayı, scriptleri, satır içi kodu ve birinci düzey parçaları toplar', async () => {
    const r = await collectSite('https://ornek.com/', path.join(work, 's'));
    expect(r.files).toEqual(expect.arrayContaining(['index.html', 'scripts/inline/inline-1.js', 'scripts/ornek.com/_next/static/app.js', 'scripts/ornek.com/_next/static/chunks/c1.js', 'scripts/cdn.x.com/lib.js']));
    expect(fs.readFileSync(path.join(work, 's', 'scripts/ornek.com/_next/static/chunks/c1.js'), 'utf8')).toContain('WebSocket');
    expect(r.bytes).toBeGreaterThan(50);
  });
  it('özel ağa çözümlenen alan adına yönlendirmeyi reddeder', async () => {
    await expect(guardedFetch('https://ornek.com/yonlendir', 1000)).rejects.toThrow(/özel/i);
  });
  it('4xx sayfayı hata sayar', async () => {
    await expect(collectSite('https://ornek.com/yok', path.join(work, 'x'))).rejects.toThrow(/404/);
  });
});
