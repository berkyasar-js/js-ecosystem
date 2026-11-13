import type { Metadata } from 'next';
import Link from 'next/link';
import { TRELLO_MODE_LABELS, TRELLO_MODES } from '@jscore/contracts';
import { Check, Code, CtaBand, PageHero, Section, StatusChip } from '@/components/ui';
import { IconArrow } from '@/components/icons';
import { INTEGRATIONS } from '@/content/platform';

export const metadata: Metadata = { title: 'Entegrasyonlar', description: 'Trello iki yönlü senkron, HubSpot, Google girişi, Kolay İK, e-posta OTP, Anthropic Claude, HMAC imzalı webhook’lar ve Vercel cron. Planlı olanlar “Yakında” rozetiyle.', alternates: { canonical: '/entegrasyonlar' } };

export default function Page() {
  const live = INTEGRATIONS.filter((i) => i.status !== 'soon');
  const soon = INTEGRATIONS.filter((i) => i.status === 'soon');
  return (
    <>
      <PageHero eyebrow="Entegrasyonlar" title="Trello’dan iki yönlü, geri kalanı açık uçlu" lede="Gerçek iş Trello’da başlıyorsa oradan taşıyoruz: webhook, saatlik uzlaştırma, kart ayrıntıları ve döngü koruması. Diğer sistemler için imzalı webhook’lar, API anahtarları ve MCP."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><Link href="/mcp" className="btn btn-lg">MCP bağlantısı</Link></>}>
        <ul className="mt-10 flex flex-wrap gap-2">{INTEGRATIONS.map((i) => <li key={i.id}><a href={`#${i.id}`} className="chip" style={{ height: 30, fontSize: 12, padding: '0 14px' }}>{i.name}</a></li>)}</ul>
      </PageHero>

      <Section id="trello-modlar" eyebrow="Trello geçiş planı" title="Paralel dönem → yalnızca okuma → kapat" lede="Ekip bir süre iki aracı birlikte kullanır; Trello her zaman güncel kalır. Sonra yazım kesilir, en sonunda senkron kapanır. Hiçbir adımda görev, proje, eşleme ya da günlük silinmez.">
        <div className="grid gap-3 md:grid-cols-3">
          {TRELLO_MODES.map((m, i) => (
            <div key={m} className="card">
              <div className="flex items-center justify-between"><span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span><code className="text-xs text-muted">mode={m}</code></div>
              <h3 className="mt-3 text-lg">{TRELLO_MODE_LABELS[m]}</h3>
              <p className="mt-1 text-sm text-muted">{m === 'two_way' ? 'Trello → JS (webhook + saatlik uzlaştırma) ve JS → Trello (liste, bitiş, üye, ad, arşiv, açıklama, kapak, yorum, checklist, ek).' : m === 'pull_only' ? 'Yalnızca Trello → JS; kartlara hiçbir şey yazılmaz. Ekip JS’e geçerken son değişiklikler akmaya devam eder.' : 'Senkron durur, kayıtlı webhook’lar Trello’dan silinir. Veriler korunur; mod tekrar açılabilir.'}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Canlı entegrasyonlar">
        <div className="grid gap-5">
          {live.map((i) => (
            <article key={i.id} id={i.id} className="card scroll-mt-28 grid gap-4 md:grid-cols-[260px_1fr]">
              <div>
                <div className="flex items-center gap-2"><h3 className="text-xl">{i.name}</h3><StatusChip status={i.status} /></div>
                <p className="mt-2 text-sm text-muted">{i.summary}</p>
                {i.note && <p className="mt-3 rounded-xl border border-line bg-nested p-3 text-xs text-muted">{i.note}</p>}
              </div>
              <ul className="grid gap-2 self-center">{i.points.map((p) => <Check key={p}>{p}</Check>)}</ul>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="Teknik" title="Webhook ve zamanlayıcı örnekleri">
        <div className="grid gap-4 md:grid-cols-2">
          <Code title="Gelen webhook (HMAC-SHA256, ham gövde)">{`POST https://<uygulama>/api/webhooks/<provider>
x-jscore-signature: sha256=<HMAC(gövde, JSCORE_WEBHOOK_SECRET)>
content-type: application/json

{ "event": "invoice.paid", "id": "inv_123" }

# ya da imza yerine 'webhooks' kapsamlı API anahtarı:
Authorization: Bearer <api-anahtarı>`}</Code>
          <Code title="Olay dağıtıcısı (Vercel Cron, 5 dk)">{`# vercel.json
{ "crons": [
  { "path": "/api/events/dispatch", "schedule": "*/5 * * * *" },
  { "path": "/api/integrations/trello/reconcile", "schedule": "0 * * * *" }
] }

# harici tetikleme
POST /api/events/dispatch
Authorization: Bearer <CRON_SECRET>`}</Code>
        </div>
      </Section>

      <Section eyebrow="Yol haritası" title="Yakında">
        <div className="grid gap-4 md:grid-cols-3">
          {soon.map((i) => <article key={i.id} id={i.id} className="card scroll-mt-28"><div className="flex items-center gap-2"><h3 className="text-lg">{i.name}</h3><StatusChip status="soon" /></div><p className="mt-2 text-sm text-muted">{i.summary}</p></article>)}
          <article className="card"><div className="flex items-center gap-2"><h3 className="text-lg">Google Takvim</h3><StatusChip status="soon" /></div><p className="mt-2 text-sm text-muted">Ajanda’daki kilometre taşları ve görev bitişlerinin takvime eşitlenmesi.</p></article>
          <article className="card"><div className="flex items-center gap-2"><h3 className="text-lg">Resend e-posta bildirimleri</h3><StatusChip status="soon" /></div><p className="mt-2 text-sm text-muted">Bildirim kurallarındaki “e-posta” kanalı: anmalar, onaylar ve günlük özet.</p></article>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
