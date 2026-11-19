import { describe, expect, it } from 'vitest';
import {
  GOOGLE_ORG_SCOPES, agendaDays, filterMailThreads, googleOrgConfigSchema, mailCounts, maskGoogleConfig, matchAddressesToCrm, mergeCalendarIntoAgenda, resolveEmailProviderChoice, type CalendarEvent, type MailThread, type MatchSource,
} from '@jscore/contracts';
import { decryptJson, deriveKey, encKeyReady, encryptJson, EncKeyMissingError, isEncrypted } from '@jscore/core/integrations/google-crypto';
import { authUrl, exchangeCode, isExpired, refreshAccessToken, signState, tokensFromResponse, verifyState, GoogleApiError } from '@jscore/core/integrations/google-oauth';
import {
  buildMime, buildReferences, decodeHeaderUtf8, encodeHeaderUtf8, extractBodies, formatAddress, fromBase64Url, htmlToText, parseAddressList, replySubject, sanitizeHtml, toBase64Url,
} from '@jscore/core/integrations/gmail-mime';
import { collectHistory, foldThread, maxHistoryId, nextHistoryId, parseGmailMessage, planSync, gmailFetch, type ParsedMail } from '@jscore/core/integrations/gmail';
import { calendarWindow, fetchCalendarEvents, normalizeEvent, _calendarCache } from '@jscore/core/integrations/google-calendar';
import { sendEmail } from '@jscore/core/notify/email';
import { gmailSender } from '@jscore/core/notify/email-gmail';

const ENV = { INTEGRATIONS_ENC_KEY: 'dGVzdC1rZXktMzItYnl0ZXMtbG9uZy0wMTIzNDU2Nzg=', JSCORE_WEBHOOK_SECRET: 'whs' } as unknown as NodeJS.ProcessEnv;
const res = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('Google · şifreleme (AES-GCM)', () => {
  it('encrypt/decrypt gidiş-dönüş; her çağrı farklı IV; biçim enc:v1', () => {
    const t = { access_token: 'ya29.x', refresh_token: '1//r', expires_at: '2026-11-19T10:00:00Z', scope: '', token_type: 'Bearer' };
    const a = encryptJson(t, ENV), b = encryptJson(t, ENV);
    expect(isEncrypted(a)).toBe(true); expect(a).not.toBe(b); expect(a).not.toContain('ya29');
    expect(decryptJson(a, ENV)).toEqual(t); expect(decryptJson(b, ENV)).toEqual(t);
  });
  it('anahtar yoksa saklamayı reddeder; yanlış anahtarla çözülmez; anahtar türetme (hex / base64 / parola)', () => {
    expect(encKeyReady({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(() => encryptJson({ a: 1 }, {} as unknown as NodeJS.ProcessEnv)).toThrow(EncKeyMissingError);
    const blob = encryptJson({ a: 1 }, ENV);
    expect(() => decryptJson(blob, { INTEGRATIONS_ENC_KEY: 'another-password-that-is-long-enough' } as unknown as NodeJS.ProcessEnv)).toThrow();
    expect(() => decryptJson('plain-token', ENV)).toThrow(/biçim/);
    expect(deriveKey('a'.repeat(64)).length).toBe(32); expect(deriveKey(ENV.INTEGRATIONS_ENC_KEY!).length).toBe(32); expect(deriveKey('short password!!').length).toBe(32);
  });
});

describe('Google · OAuth yardımcıları', () => {
  it('state imzalı; süresi geçmiş / bozuk / yanlış sır reddedilir', () => {
    const now = Date.parse('2026-11-19T10:00:00Z');
    const s = signState({ kind: 'org', org_id: 'o1', user_id: 'u1', scopes: ['a'], return_to: '/admin/integrations' }, ENV, now);
    expect(verifyState(s, ENV, now + 60_000)).toMatchObject({ kind: 'org', org_id: 'o1', user_id: 'u1' });
    expect(verifyState(s, ENV, now + 11 * 60_000)).toBeNull();
    expect(verifyState(`${s}x`, ENV, now)).toBeNull();
    expect(verifyState(s, { JSCORE_WEBHOOK_SECRET: 'other' } as unknown as NodeJS.ProcessEnv, now)).toBeNull();
    expect(verifyState(null, ENV, now)).toBeNull();
  });
  it('authUrl: offline + consent + kapsamlar + login_hint', () => {
    const u = new URL(authUrl({ clientId: 'cid', redirectUri: 'https://x/cb', scopes: GOOGLE_ORG_SCOPES, state: 'st', loginHint: 'hello@jobsstudio.co' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('access_type')).toBe('offline'); expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('scope')).toContain('gmail.send'); expect(u.searchParams.get('login_hint')).toBe('hello@jobsstudio.co'); expect(u.searchParams.get('redirect_uri')).toBe('https://x/cb');
  });
  it('token yanıtı → GoogleTokens (expires_at 60 sn pay); refresh token korunur; isExpired', () => {
    const now = Date.parse('2026-11-19T10:00:00Z');
    const t = tokensFromResponse({ access_token: 'A', expires_in: 3600, scope: 's' }, 'R', now);
    expect(t.refresh_token).toBe('R'); expect(Date.parse(t.expires_at)).toBe(now + 3540_000);
    expect(isExpired(t, now)).toBe(false); expect(isExpired(t, now + 3600_000)).toBe(true);
  });
  it('exchangeCode: refresh token yoksa hata; refreshAccessToken 5xx’te yeniden dener, invalid_grant anında fırlatır', async () => {
    const env = { clientId: 'c', clientSecret: 's' };
    const noRefresh = async () => res(200, { access_token: 'A', expires_in: 3600 });
    await expect(exchangeCode(env, 'code', 'https://x/cb', { fetchImpl: noRefresh as typeof fetch })).rejects.toThrow(/refresh token/);
    let calls = 0;
    const flaky = (async () => { calls++; return calls < 3 ? res(503, { error: 'backend' }) : res(200, { access_token: 'NEW', expires_in: 3600 }); }) as typeof fetch;
    const t = await refreshAccessToken(env, { access_token: 'old', refresh_token: 'R', expires_at: '2020-01-01T00:00:00Z', scope: '', token_type: 'Bearer' }, { fetchImpl: flaky, sleep: async () => undefined });
    expect(t.access_token).toBe('NEW'); expect(t.refresh_token).toBe('R'); expect(calls).toBe(3);
    const bad = (async () => res(400, { error: 'invalid_grant' })) as typeof fetch;
    await expect(refreshAccessToken(env, t, { fetchImpl: bad, sleep: async () => undefined })).rejects.toBeInstanceOf(GoogleApiError);
  });
  it('org config şeması + maske: token asla dönmez; cron durumu', () => {
    const cfg = googleOrgConfigSchema.parse({ email: 'hello@jobsstudio.co', tokens_enc: 'enc:v1:a:b:cdefghijkl', scopes: GOOGLE_ORG_SCOPES, connected_at: '2026-11-19T09:00:00Z', last_sync_at: '2026-11-19T09:50:00Z' });
    expect(cfg.display_name).toBe('Jobs Studio'); expect(cfg.calendar_id).toBe('primary');
    const m = maskGoogleConfig(cfg, { now: '2026-11-19T10:00:00Z', envReady: true, encReady: true });
    expect(JSON.stringify(m)).not.toContain('tokens_enc'); expect(m.connected).toBe(true); expect(m.cron).toBe('ok');
    expect(maskGoogleConfig(cfg, { now: '2026-11-19T10:31:00Z', envReady: true, encReady: true }).cron).toBe('stale');
    expect(maskGoogleConfig(null, { envReady: false, encReady: false }).connected).toBe(false);
  });
});

describe('Gmail · MIME kurucu', () => {
  it('UTF-8 konu RFC 2047 ile kodlanır, ASCII konu olduğu gibi; çok baytlı karakter bölünmez', () => {
    expect(encodeHeaderUtf8('Hello')).toBe('Hello');
    const enc = encodeHeaderUtf8('Onay istendi: Şişli lansmanı — ÇĞİÖŞÜ ğüşiöç ' .repeat(3));
    expect(enc.startsWith('=?UTF-8?B?')).toBe(true);
    const decoded = decodeHeaderUtf8(enc.replace(/\r\n /g, ' '));
    expect(decoded).toBe('Onay istendi: Şişli lansmanı — ÇĞİÖŞÜ ğüşiöç '.repeat(3));
  });
  it('formatAddress / parseAddressList gidiş-dönüş (2047 ad, tırnak, çoklu)', () => {
    expect(formatAddress('hello@jobsstudio.co', 'Jobs Studio')).toBe('Jobs Studio <hello@jobsstudio.co>');
    expect(formatAddress('a@b.co', 'Öz, Ltd.')).toMatch(/^=\?UTF-8\?B\?.*\?= <a@b\.co>$/);
    expect(formatAddress('a@b.co', 'Smith, John')).toBe('"Smith, John" <a@b.co>');
    const list = parseAddressList(`${formatAddress('a@b.co', 'Öz, Ltd.')}, "Smith, John" <J@B.co>, plain@x.io`);
    expect(list).toEqual([{ email: 'a@b.co', name: 'Öz, Ltd.' }, { email: 'j@b.co', name: 'Smith, John' }, { email: 'plain@x.io', name: '' }]);
  });
  it('buildMime: From/To/Reply-To/Subject/In-Reply-To/References + multipart/alternative (text + html, base64 UTF-8)', () => {
    const raw = buildMime({ from: 'Jobs Studio <hello@jobsstudio.co>', to: ['ali@acme.com'], replyTo: 'Jobs Studio <hello@jobsstudio.co>', subject: 'Re: Teklif — Şubat', text: 'Merhaba Ali,\nteklif ekte.', html: '<p>Merhaba <b>Ali</b></p>', inReplyTo: '<abc@mail.acme.com>', references: '<root@acme.com> <abc@mail.acme.com>', date: new Date('2026-11-19T10:00:00Z'), headers: { 'List-Unsubscribe': '<https://x/u>' } });
    const cut = raw.indexOf('\r\n\r\n'); const head = raw.slice(0, cut), body = raw.slice(cut);
    expect(head).toContain('From: Jobs Studio <hello@jobsstudio.co>'); expect(head).toContain('To: ali@acme.com'); expect(head).toContain('Reply-To: Jobs Studio <hello@jobsstudio.co>');
    expect(head).toMatch(/Subject: =\?UTF-8\?B\?/); expect(head).toContain('In-Reply-To: <abc@mail.acme.com>'); expect(head).toContain('References: <root@acme.com> <abc@mail.acme.com>');
    expect(head).toContain('List-Unsubscribe: <https://x/u>'); expect(head).toContain('MIME-Version: 1.0'); expect(head).toMatch(/Content-Type: multipart\/alternative; boundary="[^"]+"/);
    expect(head).toContain('Date: Thu, 19 Nov 2026 10:00:00 +0000');
    expect(body).toContain('Content-Type: text/plain; charset="UTF-8"'); expect(body).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(body).toContain(Buffer.from('Merhaba Ali,\nteklif ekte.').toString('base64')); expect(body).toContain(Buffer.from('<p>Merhaba <b>Ali</b></p>').toString('base64'));
    expect(raw.split('\r\n').every((l) => l.length <= 998)).toBe(true);
    // base64url gidiş-dönüş (Gmail `raw`)
    expect(fromBase64Url(toBase64Url(raw))).toBe(raw);
    const plain = buildMime({ from: 'a@b.co', to: ['c@d.co'], subject: 'Hi', text: 'x' });
    expect(plain).toContain('Content-Type: text/plain'); expect(plain).not.toContain('multipart');
  });
  it('replySubject / buildReferences', () => {
    expect(replySubject('Teklif')).toBe('Re: Teklif'); expect(replySubject('RE: Teklif')).toBe('RE: Teklif'); expect(replySubject('Ynt: Teklif')).toBe('Ynt: Teklif');
    expect(buildReferences(null, 'a@x')).toBe('<a@x>'); expect(buildReferences('<r@x> <a@x>', '<a@x>')).toBe('<r@x> <a@x>'); expect(buildReferences('<r@x>', '<b@x>')).toBe('<r@x> <b@x>'); expect(buildReferences(null, null)).toBeNull();
  });
});

describe('Gmail · yük ayrıştırma & HTML temizleyici', () => {
  const b64 = (s: string) => toBase64Url(Buffer.from(s, 'utf8'));
  it('extractBodies: multipart içinden text + html + ek meta; html tek ise metin üretir', () => {
    const payload = { mimeType: 'multipart/mixed', parts: [
      { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64('Merhaba düz') } }, { mimeType: 'text/html', body: { data: b64('<p>Merhaba <b>html</b></p>') } }] },
      { mimeType: 'application/pdf', filename: 'teklif.pdf', body: { attachmentId: 'att1', size: 1234 } },
    ] };
    const b = extractBodies(payload);
    expect(b.text).toBe('Merhaba düz'); expect(b.html).toContain('<b>html</b>'); expect(b.attachments).toEqual([{ filename: 'teklif.pdf', mime: 'application/pdf', size: 1234, attachment_id: 'att1' }]);
    expect(extractBodies({ mimeType: 'text/html', body: { data: b64('<div>Sadece<br>html &amp; eğlence</div>') } }).text).toBe('Sadece\nhtml & eğlence');
    expect(htmlToText('<style>p{}</style><p>a</p><p>b</p>')).toBe('a\nb');
  });
  it('sanitizeHtml: script/style/iframe/form silinir, on* ve javascript: atılır, izinli etiketler kalır, bilinmeyenler soyulur, a → rel/target', () => {
    const dirty = `<html><head><title>x</title><style>p{color:red}</style></head><body><script>alert(1)</script><p onclick="evil()" style="color:red" class="c">Merhaba <b>Ali</b> <a href="javascript:alert(1)">kötü</a> <a href="https://acme.com/x?a=1&b=2" title="t">iyi</a> <a href="mailto:a@b.co">mail</a></p><iframe src="https://evil"></iframe><form action="/x"><input name="q"></form><img src="https://acme.com/logo.png" onerror="x()" alt="logo"><img src="data:text/html,xx"><custom-tag>metin</custom-tag><table><tr><td colspan="2">hücre</td></tr></table><!-- yorum --><svg onload="x()"><circle/></svg></body></html>`;
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/<script|<style|<iframe|<form|<input|<svg|<title|onclick|onerror|onload|javascript:|style=|class=|<!--/i);
    expect(clean).toContain('<p>Merhaba <b>Ali</b>'); expect(clean).toContain('<a href="https://acme.com/x?a=1&amp;b=2" title="t" rel="noopener noreferrer nofollow" target="_blank">iyi</a>');
    expect(clean).toContain('<a rel="noopener noreferrer nofollow" target="_blank">kötü</a>'); expect(clean).toContain('<a href="mailto:a@b.co" rel="noopener noreferrer nofollow" target="_blank">mail</a>');
    expect(clean).toContain('<img src="https://acme.com/logo.png" alt="logo" loading="lazy" />'); expect(clean).toContain('<img loading="lazy" />'); expect(clean).toContain('metin'); expect(clean).toContain('<td colspan="2">hücre</td>');
    expect(sanitizeHtml('')).toBe('');
  });
  it('parseGmailMessage: başlıklar, adresler, tarih (internalDate), UNREAD, seçili raw_headers', () => {
    const m = parseGmailMessage({ id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD'], snippet: 'özet', internalDate: String(Date.parse('2026-11-19T09:00:00Z')), payload: {
      mimeType: 'text/plain', headers: [{ name: 'From', value: 'Ali Veli <Ali@Acme.com>' }, { name: 'To', value: 'hello@jobsstudio.co, x@y.co' }, { name: 'Subject', value: '=?UTF-8?B?VGVrbGlmIMWfdWJhdA==?=' }, { name: 'Message-ID', value: '<abc@acme.com>' }, { name: 'X-Secret', value: 'drop' }], body: { data: b64('gövde') } } });
    expect(m.from).toEqual({ email: 'ali@acme.com', name: 'Ali Veli' }); expect(m.to).toEqual(['hello@jobsstudio.co', 'x@y.co']); expect(m.date).toBe('2026-11-19T09:00:00.000Z'); expect(m.unread).toBe(true);
    expect(m.text).toBe('gövde'); expect(m.message_id_header).toBe('<abc@acme.com>'); expect(m.raw_headers['x-secret']).toBeUndefined(); expect(m.raw_headers.subject).toBe('=?UTF-8?B?VGVrbGlmIMWfdWJhdA==?=');
    expect(parseGmailMessage({ id: 'm2', threadId: 't1', payload: { headers: [] } }).subject).toBe('(konu yok)');
  });
});

describe('Gmail · eşitleme mantığı (saf)', () => {
  it('planSync: history id varsa history, yoksa liste (newer_than)', () => {
    expect(planSync({ history_id: '12345' })).toEqual({ mode: 'history', startHistoryId: '12345' });
    expect(planSync({})).toMatchObject({ mode: 'list' }); expect(planSync({ history_id: 'abc' })).toMatchObject({ mode: 'list' });
  });
  it('maxHistoryId / nextHistoryId: sayısal büyük (BigInt), geçersiz imleçte profile’a sıfırlama', () => {
    expect(maxHistoryId('9', '10')).toBe('10'); expect(maxHistoryId('99999999999999999999', '100000000000000000000')).toBe('100000000000000000000'); expect(maxHistoryId(null, '5')).toBe('5'); expect(maxHistoryId(null, null)).toBeNull();
    expect(nextHistoryId({ stored: '100', seen: '150', profile: '140', invalid: false })).toBe('150');
    expect(nextHistoryId({ stored: '100', seen: null, profile: '140', invalid: false })).toBe('140');
    expect(nextHistoryId({ stored: '100', seen: '150', profile: '90', invalid: true })).toBe('90');
  });
  it('collectHistory: sayfalardan tekil ileti id’leri + en büyük historyId', () => {
    const c = collectHistory([
      { historyId: '200', history: [{ id: '1', messagesAdded: [{ message: { id: 'a', threadId: 't1' } }, { message: { id: 'b', threadId: 't2' } }] }] },
      { historyId: '210', history: [{ id: '2', messagesAdded: [{ message: { id: 'a', threadId: 't1' } }, { message: { id: 'c', threadId: 't1' } }] }, { id: '3' }] },
    ]);
    expect(c.ids.map((x) => x.id)).toEqual(['a', 'b', 'c']); expect(c.historyId).toBe('210');
  });
  it('foldThread: ilk ileti gönderen/konu, son ileti snippet; giden ileti okunmamış yapmaz; karşı taraf giden iletiden alıcı olur', () => {
    const base: ParsedMail = { gmail_message_id: 'm', gmail_thread_id: 't', subject: 'Teklif', snippet: 's1', from: { email: 'ali@acme.com', name: 'Ali' }, to: ['hello@jobsstudio.co'], cc: [], date: '2026-11-19T09:00:00Z', text: '', html_sanitized: '', attachments: [], message_id_header: null, in_reply_to: null, references_header: null, labels: ['INBOX', 'UNREAD'], unread: true, raw_headers: { from: 'Ali' } };
    const t1 = foldThread(null, base, 'hello@jobsstudio.co');
    expect(t1).toMatchObject({ subject: 'Teklif', from_email: 'ali@acme.com', from_name: 'Ali', unread: true, message_count: 1, snippet: 's1' });
    const reply: ParsedMail = { ...base, gmail_message_id: 'm2', snippet: 's2', from: { email: 'hello@jobsstudio.co', name: 'Jobs' }, to: ['ali@acme.com'], date: '2026-11-19T10:00:00Z', labels: ['SENT'], unread: false, subject: 'Re: Teklif' };
    const t2 = foldThread({ ...t1, unread: false } as MailThread, reply, 'hello@jobsstudio.co');
    expect(t2).toMatchObject({ subject: 'Teklif', from_email: 'ali@acme.com', snippet: 's2', message_count: 2, unread: false, last_message_at: '2026-11-19T10:00:00Z' });
    // Giden ileti ile başlayan konu: karşı taraf alıcı
    const t3 = foldThread(null, reply, 'hello@jobsstudio.co');
    expect(t3.from_email).toBe('ali@acme.com'); expect(t3.unread).toBe(false);
  });
  it('gmailFetch: 429 → yeniden dener, 401 → anlaşılır hata', async () => {
    let n = 0;
    const f = (async () => { n++; return n === 1 ? res(429, { error: { message: 'rate' } }) : res(200, { emailAddress: 'hello@jobsstudio.co', historyId: '1' }); }) as typeof fetch;
    expect(await gmailFetch('tok', '/profile', { fetchImpl: f, sleep: async () => undefined })).toMatchObject({ historyId: '1' });
    await expect(gmailFetch('tok', '/profile', { fetchImpl: (async () => res(401, { error: { message: 'x' } })) as typeof fetch })).rejects.toThrow(/yeniden bağlan/);
  });
});

describe('Gönderen → müşteri eşleme (saf)', () => {
  const src: MatchSource = {
    clients: [{ id: 'c1', email: 'info@acme.com', domain: 'https://www.acme.com/' }, { id: 'c2', email: null, domain: 'beta.io' }, { id: 'c3', email: 'ceo@gmail.com', domain: 'gmail.com' }],
    brands: [{ id: 'b1', client_id: 'c1' }, { id: 'b2', client_id: 'c2' }, { id: 'b3', client_id: 'c2' }],
    contacts: [{ id: 'k1', client_id: 'c1', brand_id: 'b1', email: 'Ali@Acme.com' }, { id: 'k2', client_id: 'c2', brand_id: null, email: 'zeynep@beta.io' }],
  };
  it('kişi e-postası > müşteri e-postası > alan adı; marka kişiden ya da tek markadan; kendi alan adı ve serbest e-posta alanları eşlenmez', () => {
    expect(matchAddressesToCrm(['ali@acme.com'], src)).toEqual({ client_id: 'c1', brand_id: 'b1', contact_id: 'k1', via: 'contact' });
    expect(matchAddressesToCrm(['hello@jobsstudio.co', 'INFO@acme.com'], src, ['jobsstudio.co'])).toEqual({ client_id: 'c1', brand_id: 'b1', contact_id: null, via: 'client_email' });
    expect(matchAddressesToCrm(['someone@acme.com'], src)).toMatchObject({ client_id: 'c1', via: 'domain' });
    expect(matchAddressesToCrm(['zeynep@beta.io'], src)).toEqual({ client_id: 'c2', brand_id: null, contact_id: 'k2', via: 'contact' }); // iki marka → null
    expect(matchAddressesToCrm(['other@beta.io'], src)).toEqual({ client_id: 'c2', brand_id: null, contact_id: null, via: 'domain' });
    expect(matchAddressesToCrm(['random@gmail.com'], src)).toBeNull(); // gmail.com alan adıyla eşlenmez
    expect(matchAddressesToCrm(['ceo@gmail.com'], src)).toMatchObject({ client_id: 'c3', via: 'client_email' }); // ama tam e-posta eşleşir
    expect(matchAddressesToCrm(['nobody@nowhere.tv'], src)).toBeNull(); expect(matchAddressesToCrm([], src)).toBeNull();
  });
  it('mail süzgeçleri ve sayımlar', () => {
    const t = (p: Partial<MailThread>) => ({ id: 'x', client_id: null, unread: false, ...p }) as MailThread;
    const rows = [t({ id: 'a', client_id: 'c1', unread: true }), t({ id: 'b' }), t({ id: 'c', unread: true })];
    expect(filterMailThreads(rows, 'matched').map((x) => x.id)).toEqual(['a']); expect(filterMailThreads(rows, 'unmatched').map((x) => x.id)).toEqual(['b', 'c']); expect(filterMailThreads(rows, 'unread').length).toBe(2);
    expect(mailCounts(rows)).toEqual({ all: 3, matched: 1, unmatched: 2, unread: 2 });
  });
});

describe('E-posta sağlayıcısı: Gmail', () => {
  it('resolveEmailProviderChoice: varsayılan gmail (bağlıysa) → resend → log; off her zaman off', () => {
    expect(resolveEmailProviderChoice(null, { gmailConnected: true, resendConfigured: true })).toBe('gmail');
    expect(resolveEmailProviderChoice(null, { gmailConnected: false, resendConfigured: true })).toBe('resend');
    expect(resolveEmailProviderChoice(null, { gmailConnected: false, resendConfigured: false })).toBe('log');
    expect(resolveEmailProviderChoice('gmail', { gmailConnected: false, resendConfigured: true })).toBe('resend');
    expect(resolveEmailProviderChoice('resend', { gmailConnected: true, resendConfigured: false })).toBe('log');
    expect(resolveEmailProviderChoice('off', { gmailConnected: true, resendConfigured: true })).toBe('off');
  });
  it('gmailSender: users.messages.send çağrısı, raw base64url MIME (From/Reply-To bağlı kutu, List-Unsubscribe), provider_id = Gmail id', async () => {
    let seen: { url: string; raw: string } | null = null;
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => { seen = { url: String(u), raw: (JSON.parse(String(init?.body)) as { raw: string }).raw }; return res(200, { id: 'gm-1', threadId: 'th-1' }); }) as typeof fetch;
    const sender = gmailSender({ token: 'tok', email: 'hello@jobsstudio.co', displayName: 'Jobs Studio', fetchImpl: f });
    const r = await sendEmail({ to: 'ali@acme.com', subject: 'Onay istendi: Şişli', html: '<p>x</p>', text: 'x', unsubscribeUrl: 'https://app/u?t=1' }, { gmail: sender, env: {} as unknown as NodeJS.ProcessEnv });
    expect(r).toEqual({ status: 'sent', provider: 'gmail', provider_id: 'gm-1' });
    expect(seen!.url).toContain('/gmail/v1/users/me/messages/send');
    const mime = fromBase64Url(seen!.raw);
    expect(mime).toContain('From: Jobs Studio <hello@jobsstudio.co>'); expect(mime).toContain('Reply-To: Jobs Studio <hello@jobsstudio.co>'); expect(mime).toContain('To: ali@acme.com'); expect(mime).toContain('List-Unsubscribe: <https://app/u?t=1>'); expect(mime).toMatch(/Subject: =\?UTF-8\?B\?/);
  });
  it('sendEmail: Gmail hatası → error (düşüş yok); off → skipped; gmail yokken Resend/günlük eski davranış', async () => {
    const bad = gmailSender({ token: 'tok', email: 'hello@jobsstudio.co', displayName: 'JS', fetchImpl: (async () => res(403, { error: { message: 'insufficient scope' } })) as typeof fetch, sleep: async () => undefined });
    const r = await sendEmail({ to: 'a@b.co', subject: 's', html: '', text: '' }, { gmail: bad, env: {} as unknown as NodeJS.ProcessEnv });
    expect(r.status).toBe('error'); expect(r.provider).toBe('gmail'); expect(r.error).toMatch(/kapsam/);
    expect((await sendEmail({ to: 'a@b.co', subject: 's', html: '', text: '' }, { off: true, env: {} as unknown as NodeJS.ProcessEnv, log: () => undefined })).status).toBe('skipped');
    expect((await sendEmail({ to: 'a@b.co', subject: 's', html: '', text: '' }, { env: {} as unknown as NodeJS.ProcessEnv, log: () => undefined })).provider).toBe('log');
  });
});

describe('Google Takvim → Ajanda', () => {
  it('normalizeEvent: iptal düşer, tüm gün algılanır', () => {
    expect(normalizeEvent({ id: 'e', status: 'cancelled', start: { date: '2026-11-20' } }, 'me')).toBeNull();
    expect(normalizeEvent({ id: 'e', summary: 'Tatil', start: { date: '2026-11-20' }, end: { date: '2026-11-21' } }, 'org')).toMatchObject({ all_day: true, source: 'org', title: 'Tatil' });
    expect(normalizeEvent({ id: 'e', start: { dateTime: '2026-11-20T09:00:00+03:00' }, end: { dateTime: '2026-11-20T10:00:00+03:00' } }, 'me')).toMatchObject({ all_day: false, title: '(başlıksız)' });
  });
  it('mergeCalendarIntoAgenda: güne göre (Europe/Istanbul), saat meta, çok günlü etkinlik her güne, aralık dışı düşer, görevlerden sonra', () => {
    const days = agendaDays({ tasks: [], milestones: [], today: '2026-11-19', days: 3 });
    const events: CalendarEvent[] = [
      { id: 'a', title: 'Müşteri toplantısı', start: '2026-11-19T21:30:00Z', end: '2026-11-19T22:00:00Z', all_day: false, source: 'me', html_link: 'https://cal/a', location: 'Zoom' }, // 00:30 İstanbul → 20 Kasım
      { id: 'b', title: 'Lansman haftası', start: '2026-11-18', end: '2026-11-21', all_day: true, source: 'org' }, // 18–20 (end dışlayıcı → 21'de yok)
      { id: 'c', title: 'Uzak', start: '2026-12-01T09:00:00Z', end: '2026-12-01T10:00:00Z', all_day: false, source: 'me' },
    ];
    const out = mergeCalendarIntoAgenda(days, events);
    expect(out.map((d) => d.items.map((i) => i.title))).toEqual([['Lansman haftası'], ['Lansman haftası', 'Müşteri toplantısı'], []]);
    const meet = out[1].items[1];
    expect(meet.kind).toBe('calendar'); expect(meet.meta).toBe('00:30–01:00 · Zoom'); expect(meet.href).toBe('https://cal/a');
    expect(out[0].items[0].meta).toBe('Tüm gün · Ajans takvimi');
    expect(mergeCalendarIntoAgenda([], events)).toEqual([]);
  });
  it('fetchCalendarEvents: sayfalama + 5 dk önbellek (ikinci çağrı ağ yok) + ETag 304', async () => {
    _calendarCache.clear();
    let calls = 0;
    const f = (async (u: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const url = new URL(String(u));
      if ((init?.headers as Record<string, string>)?.['if-none-match'] === 'W/"e1"') return new Response(null, { status: 304 });
      if (url.searchParams.get('pageToken') === 'p2') return res(200, { items: [{ id: '2', summary: 'B', start: { dateTime: '2026-11-20T10:00:00Z' }, end: { dateTime: '2026-11-20T11:00:00Z' } }] });
      return res(200, { etag: 'W/"e1"', nextPageToken: 'p2', items: [{ id: '1', summary: 'A', start: { date: '2026-11-19' }, end: { date: '2026-11-20' } }] });
    }) as typeof fetch;
    const win = calendarWindow('2026-11-19', 14);
    expect(win.timeMin).toBe('2026-11-19T00:00:00.000Z'); expect(win.timeMax).toBe('2026-12-03T00:00:00.000Z');
    const now = Date.parse('2026-11-19T10:00:00Z');
    const ev = await fetchCalendarEvents('tok', { ...win, source: 'me', fetchImpl: f, cacheKey: 'k', now });
    expect(ev.map((e) => e.title)).toEqual(['A', 'B']); expect(calls).toBe(2);
    await fetchCalendarEvents('tok', { ...win, source: 'me', fetchImpl: f, cacheKey: 'k', now: now + 60_000 });
    expect(calls).toBe(2); // önbellek
    const again = await fetchCalendarEvents('tok', { ...win, source: 'me', fetchImpl: f, cacheKey: 'k', now: now + 6 * 60_000 });
    expect(calls).toBe(3); expect(again.length).toBe(2); // 304 → önbellek yenilendi
  });
});
