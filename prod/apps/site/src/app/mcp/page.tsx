import type { Metadata } from 'next';
import Link from 'next/link';
import { API_TOKEN_SCOPES, TOKEN_ADMIN_ROLES, ROLE_LABELS } from '@jscore/contracts';
import { Check, Code, CtaBand, Feature, PageHero, Section, StatusChip } from '@/components/ui';
import { IconArrow, IconBot, IconKey, IconPlug } from '@/components/icons';
import { MCP_METHODS, MCP_SCOPES, MCP_TOOLS } from '@/content/platform';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'MCP bağlantısı', description: 'JS Workspace MCP sunucusu (/api/mcp): araçlar, API anahtarı kapsamları ve ömür politikası, Claude Desktop / Claude Code örnek yapılandırması ve ajanların dış MCP sunucularına bağlanması.', alternates: { canonical: '/mcp' } };

const APP = SITE.appUrl;

export default function Page() {
  return (
    <>
      <PageHero eyebrow="MCP" title="Claude’a (ve her MCP istemcisine) açık çalışma alanı" lede="Uygulama, Model Context Protocol ile konuşan bir JSON-RPC uç noktası sunar: /api/mcp. Claude Desktop, Claude Code ya da kendi ajanınız, proje durumunu okuyup onay akışına giren görev taslakları açabilir."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link><a href="#kurulum" className="btn btn-lg">Kurulum örnekleri</a></>} />

      <Section eyebrow="Sunucu" title="/api/mcp — neler var" lede="Aşağıdaki liste uygulamanın kaynak kodundaki araç tanımıyla aynıdır (apps/web → lib/mcp.ts). Sunucu bilgisi: jscore-mcp · protokol 2025-03-26 · yetenek: tools.">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="card">
            <div className="flex items-center gap-2"><h3 className="text-lg">Araçlar (tools)</h3><StatusChip status="live" /></div>
            <ul className="mt-3 grid gap-3">
              {MCP_TOOLS.map((t) => <li key={t.name} className="nested"><code className="text-sm font-semibold text-brand-ink">{t.name}</code><p className="mt-1 text-sm text-muted">{t.desc}</p><p className="mt-1 text-xs text-muted">Argümanlar: <code>{t.args}</code></p></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">create_task_draft görevi <em>brief</em> aşamasında, <code>source_ref=mcp</code> ile açar; demo modunda kalıcı değildir (<code>persisted:false</code>).</p>
          </div>
          <div className="grid gap-4">
            <div className="card">
              <h3 className="text-lg">Yöntemler</h3>
              <ul className="mt-3 flex flex-wrap gap-1.5">{MCP_METHODS.map((m) => <li key={m} className="chip chip-brand">{m}</li>)}</ul>
              <p className="mt-3 text-sm text-muted">JSON-RPC 2.0, yalnızca <code>POST</code>. Bildirimler (id’siz) 202 döner. Taşıma: HTTP istek/yanıt (akış/SSE yok).</p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2"><h3 className="text-lg">Kaynaklar (resources) & istemler (prompts)</h3><StatusChip status="soon" /></div>
              <p className="mt-2 text-sm text-muted">Bugün yalnızca <code>tools</code> yeteneği var. Proje/marka özetlerinin kaynak olarak sunulması ve kurul istemlerinin paylaşılması yol haritasında.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="Kimlik" title="API anahtarları, kapsamlar ve ömür" lede="Anahtar Yönetim Paneli → Entegrasyonlar → API Anahtarları’ndan üretilir; yalnızca sha256 özeti saklanır, düz metin bir kez gösterilir.">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={<IconKey />} title="Kim üretir">{TOKEN_ADMIN_ROLES.map((r) => ROLE_LABELS[r]).join(', ')}. Her anahtar bir organizasyona bağlıdır; MCP çağrıları o organizasyonun verisini görür.</Feature>
          <Feature icon={<IconPlug />} title="Kapsamlar"><span className="flex flex-wrap gap-1">{API_TOKEN_SCOPES.map((s) => <code key={s} className="chip">{s}</code>)}</span><span className="mt-2 block">{MCP_SCOPES.map((s) => <span key={s.scope} className="block text-xs">{s.desc}</span>)}</span></Feature>
          <Feature icon={<IconBot />} title="Ömür politikası">Oluştururken son kullanma (1–730 gün) ya da süresiz. Panel → Güvenlik: <em>en uzun ömür</em> ve <em>izinli kapsamlar</em> politikası; her istekte iptal + süre + kapsam denetimi, son kullanım güncellenir.</Feature>
        </div>
      </Section>

      <Section id="kurulum" eyebrow="Kurulum" title="Örnek yapılandırmalar">
        <div className="grid gap-4 lg:grid-cols-2">
          <Code title="curl ile dene">{`curl -X POST ${APP}/api/mcp \\
  -H "Authorization: Bearer <api-anahtarı>" \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# demo modunda token: jsdemo_token`}</Code>
          <Code title="tools/call örneği">{`{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": {
    "name": "create_task_draft",
    "arguments": { "project_id": "p_acme", "title": "Kasım SM · 12 görsel", "priority": "high" }
  }
}`}</Code>
          <Code title="Claude Code">{`claude mcp add --transport http jsworkspace ${APP}/api/mcp \\
  --header "Authorization: Bearer <api-anahtarı>"`}</Code>
          <Code title="claude_desktop_config.json (mcp-remote köprüsüyle)">{`{
  "mcpServers": {
    "jsworkspace": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${APP}/api/mcp",
               "--header", "Authorization: Bearer \${JSW_TOKEN}"],
      "env": { "JSW_TOKEN": "<api-anahtarı>" }
    }
  }
}`}</Code>
        </div>
        <p className="mt-4 max-w-3xl text-xs text-muted">Not: Sunucu yalnızca POST JSON-RPC konuşur; bazı istemciler Streamable HTTP el sıkışmasında GET/SSE bekleyebilir. Kurulum sırasında kullandığınız istemciyle birlikte doğrularız. Uç nokta curl ve JSON-RPC testleriyle doğrulanmıştır.</p>
      </Section>

      <Section eyebrow="İki yönlü" title="Ajanlar dış MCP sunucularına bağlanır" lede="Yönetim Paneli → Entegrasyonlar → MCP sunucuları: organizasyonun kullandığı dış MCP sunucuları (ör. Figma, dosya, analitik) ad, URL, durum ve araç listesiyle kayıtlıdır.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <div className="flex items-center gap-2"><h3 className="text-lg">Bugün</h3><StatusChip status="live" /></div>
            <ul className="mt-3 grid gap-2">
              <Check>MCP sunucu kaydı (ad, URL, araçlar, bağlı/hazır durumu) panelde</Check>
              <Check>Kendi uç noktamız (/api/mcp) aynı listede “JS Core MCP” olarak görünür</Check>
              <Check>Her ajan çalıştırması girdi/çıktı/maliyetle günlüğe yazılır</Check>
            </ul>
          </div>
          <div className="card">
            <div className="flex items-center gap-2"><h3 className="text-lg">Yol haritası</h3><StatusChip status="soon" /></div>
            <ul className="mt-3 grid gap-2">
              <Check>Kurul ve operasyon ajanlarının kayıtlı MCP sunucularındaki araçları çağırması (tool-use)</Check>
              <Check>Araç çağrılarının onay kartına düşmesi (Planla modu) ve ajan politikasıyla sınırlanması</Check>
              <Check>OAuth ile bağlanan uzak sunucular</Check>
            </ul>
          </div>
        </div>
      </Section>
      <CtaBand title="Kendi ajanınızı çalışma alanına bağlamak ister misiniz?" sub="Demo’da MCP uç noktasını birlikte deneriz; istemcinizle uyumu doğrularız." />
    </>
  );
}
