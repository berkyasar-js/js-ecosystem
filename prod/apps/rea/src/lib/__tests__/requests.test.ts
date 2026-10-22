import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from '../limits';
import { buildAnalyzeArgs, buildInspectArgs, buildLocalCommands, buildRunRequest, buildSummaryRequest, buildTraceRequest, extractKeywords, isPrivateIpLiteral, normalizeWebUrl, validateUpload } from '../rea/requests';

const ORG = '11111111-1111-4111-8111-111111111111';
const base = { org_id: ORG, target_url: null, upload_path: null, upload_name: null, upload_bytes: null };

describe('normalizeWebUrl', () => {
  it('https ekler ve fragmenti atar', () => {
    const r = normalizeWebUrl('ornek.com/app#x');
    expect(r).toEqual({ ok: true, url: 'https://ornek.com/app', host: 'ornek.com' });
  });
  it.each(['http://localhost:3000', 'http://127.0.0.1', 'http://10.1.2.3/x', 'http://169.254.169.254/latest', 'http://192.168.0.5', 'http://[::1]/', 'http://2130706433/', 'http://intranet', 'http://x.internal', 'file:///etc/passwd', 'ftp://ornek.com', 'https://user:pw@ornek.com', ''])('reddeder: %s', (u) => {
    expect(normalizeWebUrl(u).ok).toBe(false);
  });
  it('özel IP aralıklarını ayırt eder', () => {
    expect(isPrivateIpLiteral('172.16.0.1')).toBe(true);
    expect(isPrivateIpLiteral('172.32.0.1')).toBe(false);
    expect(isPrivateIpLiteral('8.8.8.8')).toBe(false);
    expect(isPrivateIpLiteral('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIpLiteral('fd00::1')).toBe(true);
  });
});

describe('REA istek üreticileri', () => {
  it('analyze argv: yol, --json, bütünlük ve süre bayrakları', () => {
    const a = buildAnalyzeArgs({ inputPath: '/tmp/app.asar', timeoutMs: 120_000, maxHeapMb: 1024, sourcePaths: ['main.js'] });
    expect(a.slice(0, 3)).toEqual(['analyze-javascript-application', '/tmp/app.asar', '--json']);
    expect(a).toContain('--integrity-policy'); expect(a[a.indexOf('--integrity-policy') + 1]).toBe('record-and-continue');
    expect(a[a.indexOf('--analysis-timeout-ms') + 1]).toBe('120000');
    expect(a[a.indexOf('--max-heap-mb') + 1]).toBe('1024');
    expect(a[a.indexOf('--source-path') + 1]).toBe('main.js');
  });
  it('analyze: zaman aşımı alt sınırı 10 sn', () => {
    const a = buildAnalyzeArgs({ inputPath: 'x', timeoutMs: 5 });
    expect(a[a.indexOf('--analysis-timeout-ms') + 1]).toBe('10000');
  });
  it('özet isteği rehberdeki jq çıktısıyla aynı biçimde', () => {
    const ev = { evidence_id: 'ev_1' };
    expect(buildSummaryRequest(ev)).toEqual({ source: { kind: 'inline', evidence: ev }, view: { kind: 'summary' } });
    expect(buildInspectArgs('/t/r.json')).toEqual(['inspect-analysis-view', '/t/r.json', '--json']);
  });
  it('izleme isteği: application doğrudan kanıt, seed exact', () => {
    const ev = { evidence_id: 'ev_1' };
    expect(buildTraceRequest(ev, { kind: 'channel', value: 'paste-text' })).toEqual({ application: ev, seed: { kind: 'channel', value: 'paste-text', match: 'exact' } });
  });
});

describe('buildRunRequest', () => {
  it('web: URL normalize edilir', () => {
    const r = buildRunRequest({ ...base, target_kind: 'web', target_url: 'ornek.com' });
    expect(r).toEqual({ ok: true, request: { mode: 'web', url: 'https://ornek.com/', host: 'ornek.com' } });
  });
  it('web: iç ağ reddedilir', () => { expect(buildRunRequest({ ...base, target_kind: 'web', target_url: 'http://localhost' }).ok).toBe(false); });
  it('bundle: asar / zip kabul, diğeri red', () => {
    expect(buildRunRequest({ ...base, target_kind: 'bundle', upload_path: `${ORG}/a/app.asar`, upload_name: 'app.asar' })).toMatchObject({ ok: true, request: { mode: 'bundle', ext: '.asar' } });
    expect(buildRunRequest({ ...base, target_kind: 'bundle', upload_path: `${ORG}/a/x.ZIP`, upload_name: 'x.ZIP' })).toMatchObject({ ok: true, request: { ext: '.zip' } });
    expect(buildRunRequest({ ...base, target_kind: 'bundle', upload_path: `${ORG}/a/x.exe`, upload_name: 'x.exe' }).ok).toBe(false);
  });
  it('yükleme başka kuruluşa ait ya da yol çıkışlı ise reddedilir', () => {
    expect(buildRunRequest({ ...base, target_kind: 'bundle', upload_path: 'baska/a/app.asar', upload_name: 'app.asar' }).ok).toBe(false);
    expect(buildRunRequest({ ...base, target_kind: 'bundle', upload_path: `${ORG}/../x/app.asar`, upload_name: 'app.asar' }).ok).toBe(false);
  });
  it('local: yalnızca .json; dosya yoksa uyarır; boyut sınırı', () => {
    expect(buildRunRequest({ ...base, target_kind: 'local', upload_path: `${ORG}/a/o.json`, upload_name: 'o.json' })).toMatchObject({ ok: true, request: { mode: 'local' } });
    expect(buildRunRequest({ ...base, target_kind: 'local', upload_path: `${ORG}/a/o.txt`, upload_name: 'o.txt' }).ok).toBe(false);
    expect(buildRunRequest({ ...base, target_kind: 'local' }).ok).toBe(false);
    expect(buildRunRequest({ ...base, target_kind: 'local', upload_path: `${ORG}/a/o.json`, upload_name: 'o.json', upload_bytes: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });
});

describe('validateUpload', () => {
  it('adı temizler ve sınırları uygular', () => {
    expect(validateUpload('bundle', '../../Wispr Flow (1).asar', 1000)).toEqual({ ok: true, safeName: 'Wispr_Flow_1_.asar' });
    expect(validateUpload('bundle', 'a.asar', MAX_UPLOAD_BYTES + 1).ok).toBe(false);
    expect(validateUpload('bundle', 'a.json', 10).ok).toBe(false);
    expect(validateUpload('local', 'a.json', 0).ok).toBe(false);
    expect(validateUpload('local', 'a.json', 10).ok).toBe(true);
  });
});

describe('buildLocalCommands', () => {
  it('Electron yolu için analyze + özet komutları', () => {
    const s = buildLocalCommands('/Applications/Wispr Flow.app/Contents/Resources/app.asar', 'Wispr Flow');
    const cmds = s.map((x) => x.command).join('\n');
    expect(cmds).toContain('analyze-javascript-application "/Applications/Wispr Flow.app/Contents/Resources/app.asar"');
    expect(cmds).toContain('> wispr-flow.json');
    expect(cmds).toContain('inspect-analysis-view ozet-istek.json');
    expect(cmds).toContain('--integrity-policy record-and-continue');
  });
  it('http adresi için Chrome + analyze-web-bundle', () => {
    const cmds = buildLocalCommands('https://ornek.com', 'Site').map((x) => x.command).join('\n');
    expect(cmds).toContain('--remote-debugging-port=9222');
    expect(cmds).toContain('list-browser-targets');
    expect(cmds).toContain('analyze-web-bundle');
  });
});

describe('extractKeywords', () => {
  it('tohum terimler ve tanımlayıcılar önce gelir, durak sözcükler elenir', () => {
    const k = extractKeywords('Konuşmayı bitirdiğimde getTextBoxInfo ile yazının kutuya nasıl yapıştırıldığını bul', ['PasteText']);
    expect(k[0]).toBe('PasteText');
    expect(k).toContain('getTextBoxInfo');
    expect(k).not.toContain('nasıl');
  });
  it('tekrarları ve kısa sözcükleri atar', () => {
    const k = extractKeywords('foo_bar foo_bar ab', ['FOO_BAR']);
    expect(k.filter((x) => x.toLowerCase() === 'foo_bar')).toHaveLength(1);
    expect(k).not.toContain('ab');
  });
});
