import { NAV_GROUPS, TASK_STATE_LABELS, TASK_STATES } from '@jscore/contracts';
import type { ProductPageData } from '@/content/product';

/* CSS ile kurulmuş ürün kabuğu; ekran görüntüsü yok. Gerçek gezinme grupları contracts NAV_GROUPS'tan gelir. */

function Shell({ active, children, title }: { active: string; children: React.ReactNode; title: string }) {
  return (
    <div className="mock" role="img" aria-label={`${title} ekranının şematik gösterimi`}>
      <div className="mock-bar">
        <span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" />
        <span className="ml-3 rounded-md border border-line bg-nested px-2 py-0.5 text-[10px] text-muted">js-ecosystem-app.vercel.app/app/{active}</span>
        <span className="ml-auto chip chip-ai">⌘K</span>
      </div>
      <div className="grid min-h-[300px] grid-cols-[120px_1fr] md:grid-cols-[150px_1fr]">
        <aside className="mock-side" aria-hidden="true">
          {NAV_GROUPS.map((g) => <div key={g.id} className={`mock-nav ${g.href.endsWith(active) || g.modules.includes(active) ? 'on' : ''}`}><i />{g.label}</div>)}
        </aside>
        <div className="p-3 md:p-4">{children}</div>
      </div>
    </div>
  );
}

const Metric = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="mock-card"><div className="text-[9px] text-muted">{label}</div><div className={`mt-1 text-base font-bold ${tone ?? ''}`}>{value}</div></div>
);

export function HeroMock() {
  return (
    <Shell active="overview" title="Ana Sayfa">
      <div className="flex items-center justify-between"><div className="text-[12px] font-bold">Bugün · Perşembe</div><span className="chip chip-ok">Kurulum %100</span></div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <Metric label="Gecikmiş" value="3" tone="text-[#ff9aa3]" /><Metric label="Bugün biten" value="7" /><Metric label="Senden bekleyen" value="4" tone="text-[#8c93ff]" /><Metric label="Ajan · bu ay" value="₺612 / ₺2.000" />
      </div>
      <div className="mt-2 grid grid-cols-[1.3fr_1fr] gap-2">
        <div className="mock-card">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold">Bugünün planı <span className="text-muted">aşamaya göre</span></div>
          {[['Üretim', 'Acme · Kasım’26 SM · 12 görsel', 'UC', 70], ['Onay', 'Nova · Lansman videosu v3', 'OE', 90], ['Brief', 'Trello #214 · Ambalaj revize', 'BY', 15], ['Teslim', 'Zeta · Aylık rapor', 'OE', 100]].map(([s, t, who, pct]) => (
            <div key={t as string} className="grid grid-cols-[52px_1fr_18px] items-center gap-2 border-t border-line py-1.5 first:border-0">
              <span className="chip" style={{ height: 18, fontSize: 9 }}>{s}</span>
              <div><div className="truncate text-[10px]">{t}</div><div className="mock-line mt-1 w-full"><div className="mock-bar-sm" style={{ width: `${pct}%` }} /></div></div>
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-brand text-[8px] font-bold text-white">{who}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <div className="mock-card">
            <div className="text-[10px] font-semibold">Senden bekleyenler</div>
            {['Bütçe onayı · ₺48.000', 'Kapsam dışı · 4 ek görsel', 'Kurul planı · 9 görev'].map((x) => <div key={x} className="mt-1.5 flex items-center justify-between text-[10px]"><span className="truncate">{x}</span><span className="chip chip-brand" style={{ height: 16, fontSize: 8 }}>Karar</span></div>)}
          </div>
          <div className="mock-card">
            <div className="text-[10px] font-semibold">Kurul & ajanlar</div>
            <div className="mt-1.5 text-[10px] text-muted">CFO: “Nova retainer marjı %18 → kota aşımı faturalansın.”</div>
            <div className="mt-1.5 flex gap-1">{['EVET', 'HAYIR', 'ERTELE'].map((a, i) => <span key={a} className={`chip ${i === 0 ? 'chip-lime' : ''}`} style={{ height: 16, fontSize: 8 }}>{a}</span>)}</div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function BoardMock() {
  const cols = TASK_STATES.slice(0, 6);
  return (
    <Shell active="tasks" title="Pano">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold">Acme · Trello <span className="chip" style={{ height: 16, fontSize: 8 }}>trello</span><span className="ml-auto chip chip-ok" style={{ height: 16, fontSize: 8 }}>Son senkron · 2 dk</span></div>
      <div className="grid grid-cols-6 gap-1.5">
        {cols.map((c, i) => (
          <div key={c} className="rounded-lg bg-[#0b0e1c] p-1.5">
            <div className="mb-1 text-[9px] font-semibold text-muted">{TASK_STATE_LABELS[c]}</div>
            {Array.from({ length: [2, 1, 3, 4, 2, 1][i] }).map((_, j) => (
              <div key={j} className="mock-card mb-1 p-1.5">
                {j === 0 && i === 2 && <div className="mb-1 h-1.5 rounded bg-[#ff4200]" />}
                <div className="mock-line w-[85%]" /><div className="mock-line mt-1 w-[55%]" />
                <div className="mt-1.5 flex items-center gap-1 text-[8px] text-muted"><span>☑ {j + 2}/{j + 5}</span><span>💬 {j}</span></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function ChatMock() {
  return (
    <div className="mock" role="img" aria-label="Kurul Sohbeti ekranının şematik gösterimi">
      <div className="mock-bar"><span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" /><span className="ml-3 text-[10px] text-muted">Yönetim Paneli → Yönetim Kurulu → Kurul Sohbeti</span><span className="ml-auto chip" style={{ height: 16, fontSize: 8 }}>Bu ay ₺612 / ₺2.000</span></div>
      <div className="grid gap-2 p-3 md:p-4">
        <div className="ml-auto max-w-[70%] rounded-xl bg-brand/30 px-3 py-2 text-[11px]">Q1’de üç yeni marka alıyoruz. Mevcut ekiple kapasite yeter mi, nasıl dağıtalım? <span className="chip" style={{ height: 16, fontSize: 8 }}>ekip.md</span></div>
        <div className="max-w-[85%] rounded-xl border border-line bg-card px-3 py-2 text-[11px]">
          <div className="mb-1 flex gap-1">{['CHAIR', 'COO', 'CFO', 'CHRO'].map((a) => <span key={a} className="chip chip-ai" style={{ height: 16, fontSize: 8 }}>{a}</span>)}</div>
          <p className="text-muted">Kapasite %112’ye çıkıyor; bir kıdemli art direktör ve iki freelancer ile dengelenir. CFO: retainer marjı korunur. Plan aşağıda.</p>
          <div className="nested mt-2 p-2">
            <div className="flex items-center justify-between text-[10px] font-bold">Plan <span className="chip chip-brand" style={{ height: 16, fontSize: 8 }}>9 görev · 4 kişi</span></div>
            {['UC · Marka onboarding şablonu · 240 dk', 'OE · Kota ve SLA belgesi · 120 dk', 'İK · AD ilanı + 2 freelancer · 90 dk'].map((t) => <div key={t} className="mt-1 flex items-center gap-1.5 text-[10px]"><span className="tick" style={{ width: 12, height: 12, fontSize: 8 }}>✓</span>{t}</div>)}
            <div className="mt-2 flex gap-1.5"><span className="btn btn-primary btn-sm" style={{ minHeight: 22, fontSize: 9, padding: '0 8px' }}>Onaya gönder</span><span className="btn btn-sm" style={{ minHeight: 22, fontSize: 9, padding: '0 8px' }}>Düzenle</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-input-line bg-input px-3 py-2 text-[10px] text-muted">Kurula sor… <span className="ml-auto chip chip-brand" style={{ height: 16, fontSize: 8 }}>Planla</span></div>
      </div>
    </div>
  );
}

function PipelineMock() {
  const cols: Array<[string, string[]]> = [['Lead', ['Beta Gıda', 'Orion Tekstil']], ['Teklif', ['Nova Kozmetik · ₺180k']], ['Sözleşme', ['Acme · retainer']], ['Kazanıldı', ['Zeta Enerji', 'Luna Pet']]];
  return (
    <Shell active="crm" title="CRM">
      <div className="mb-2 flex gap-2 text-[10px]">{['Pipeline', 'Müşteriler & Markalar', 'Teklifler', 'Müşteri portalı'].map((t, i) => <span key={t} className={`rounded-md px-2 py-0.5 ${i === 0 ? 'bg-ink text-canvas font-semibold' : 'text-muted'}`}>{t}</span>)}</div>
      <div className="grid grid-cols-4 gap-1.5">{cols.map(([c, items]) => <div key={c} className="rounded-lg bg-[#0b0e1c] p-1.5"><div className="mb-1 text-[9px] font-semibold text-muted">{c}</div>{items.map((x) => <div key={x} className="mock-card mb-1 p-1.5 text-[10px]">{x}<div className="mt-1 mock-line w-1/2" /></div>)}</div>)}</div>
      <div className="mt-2 grid grid-cols-3 gap-2"><Metric label="Marka sağlığı (ort.)" value="78" tone="text-[#3ddc97]" /><Metric label="Açık teklif" value="₺412k" /><Metric label="Kota aşımı" value="2 marka" tone="text-[#ffb020]" /></div>
    </Shell>
  );
}

function GridMock() {
  const items = ['Studio', 'Social', 'Media', 'Review', 'Transfer', 'Present', 'Marketing', 'Events'];
  return (
    <Shell active="uretim" title="Üretim">
      <div className="mb-2 text-[11px] font-bold">Üretim</div>
      <div className="grid grid-cols-4 gap-1.5">{items.map((x, i) => <div key={x} className="mock-card p-2"><div className="mb-1 h-5 w-5 rounded-md" style={{ background: ['#1b25e0', '#ff4200', '#00f0ff', '#ccff00', '#8c93ff', '#ff3366', '#3ddc97', '#ffb020'][i] }} /><div className="text-[10px] font-semibold">JS {x}</div><div className="mt-0.5 text-[9px] text-muted">{[12, 48, 230, 6, 3, 9, 4, 2][i]} öğe</div></div>)}</div>
      <div className="mock-card mt-2"><div className="text-[10px] font-semibold">Social · Acme × Kasım’26</div><div className="mt-1.5 grid grid-cols-7 gap-1">{Array.from({ length: 14 }).map((_, i) => <div key={i} className={`h-5 rounded ${[1, 3, 4, 8, 10, 12].includes(i) ? 'bg-brand/60' : 'bg-nested'}`} />)}</div></div>
    </Shell>
  );
}

function PeopleMock() {
  const ppl: Array<[string, string, number]> = [['Ufuk C.', 'Art Director', 112], ['Oya E.', 'Account', 86], ['Berk Y.', 'Kurucu', 64], ['Berfin K.', 'Copy', 95], ['Freelancer · 2', 'Motion', 40]];
  return (
    <Shell active="people" title="İş yükü">
      <div className="mb-2 flex gap-2 text-[10px]">{['Kişiler', 'İş yükü', 'Kaynaklar', 'İkizler', 'İşe alım'].map((t, i) => <span key={t} className={`rounded-md px-2 py-0.5 ${i === 1 ? 'bg-ink text-canvas font-semibold' : 'text-muted'}`}>{t}</span>)}</div>
      <div className="mock-card">{ppl.map(([n, r, pct]) => <div key={n} className="grid grid-cols-[90px_60px_1fr_34px] items-center gap-2 border-t border-line py-1.5 text-[10px] first:border-0"><span className="font-semibold">{n}</span><span className="text-muted">{r}</span><div className="mock-line"><div className="mock-bar-sm" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? '#ff4200' : undefined }} /></div><span className={pct > 100 ? 'text-[#ff9aa3]' : ''}>%{pct}</span></div>)}</div>
      <div className="mt-2 grid grid-cols-3 gap-2"><Metric label="Haftalık kapasite" value="200 sa" /><Metric label="Planlanan" value="214 sa" tone="text-[#ffb020]" /><Metric label="İzinde" value="1" /></div>
    </Shell>
  );
}

function FinanceMock() {
  return (
    <Shell active="finance" title="Finans">
      <div className="mb-2 flex gap-2 text-[10px]">{['Bütçe', 'Gider', 'Faturalar', 'Marj', 'Defter'].map((t, i) => <span key={t} className={`rounded-md px-2 py-0.5 ${i === 3 ? 'bg-ink text-canvas font-semibold' : 'text-muted'}`}>{t}</span>)}</div>
      <div className="grid grid-cols-3 gap-2"><Metric label="Aylık gelir" value="₺1,84M" /><Metric label="Marj" value="%31" tone="text-[#3ddc97]" /><Metric label="Vadesi geçen" value="₺96k" tone="text-[#ff9aa3]" /></div>
      <div className="mock-card mt-2"><div className="text-[10px] font-semibold">Proje kârlılığı</div><div className="mt-2 flex h-20 items-end gap-1.5">{[40, 65, 30, 80, 55, 70, 90, 45, 60, 75].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 6 ? '#ccff00' : 'linear-gradient(180deg,#434bfa,#1b25e0)' }} />)}</div></div>
    </Shell>
  );
}

function AdminMock() {
  const rows: Array<[string, boolean]> = [['JS CRM', true], ['JS Finance', true], ['JS Studio', true], ['JS Events', false], ['Dijital İkizler', true], ['JS Hire', false]];
  return (
    <div className="mock" role="img" aria-label="Ana Yönetim Paneli ekranının şematik gösterimi">
      <div className="mock-bar"><span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" /><span className="ml-3 rounded-md border border-line bg-nested px-2 py-0.5 text-[10px] text-muted">js-ecosystem-admin.vercel.app/admin/modules</span></div>
      <div className="grid min-h-[300px] grid-cols-[130px_1fr]">
        <aside className="mock-side">{['Genel bakış', 'Kurulum', 'Modüller & Özellikler', 'Kullanıcılar & Roller', 'Çalışanlar', 'Entegrasyonlar', 'Otomasyonlar', 'Ajanlar & Maliyet', 'Yönetim Kurulu', 'Denetim kaydı', 'Güvenlik', 'Organizasyon'].map((x, i) => <div key={x} className={`mock-nav ${i === 2 ? 'on' : ''}`}><i />{x}</div>)}</aside>
        <div className="p-3 md:p-4">
          <div className="text-[11px] font-bold">Modüller & Özellikler</div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">{rows.map(([n, on]) => <div key={n} className="mock-card flex items-center justify-between p-2 text-[10px]"><span>{n}</span><span className={`h-3.5 w-7 rounded-full ${on ? 'bg-[#3ddc97]' : 'bg-nested'} relative`}><span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-canvas ${on ? 'right-0.5' : 'left-0.5'}`} /></span></div>)}</div>
          <div className="mock-card mt-2"><div className="text-[10px] font-semibold">JS Finance · özellikler</div><div className="mt-1.5 flex flex-wrap gap-1">{['invoices ✓', 'purchasing ✓', 'margin ✓', 'ledger ✕'].map((x) => <span key={x} className={`chip ${x.endsWith('✓') ? 'chip-ok' : ''}`} style={{ height: 16, fontSize: 8 }}>finance.{x}</span>)}</div></div>
        </div>
      </div>
    </div>
  );
}

function ReaMock() {
  return (
    <div className="mock" role="img" aria-label="Ters Mühendislik Stüdyosu ekranının şematik gösterimi">
      <div className="mock-bar"><span className="mock-dot" /><span className="mock-dot" /><span className="mock-dot" /><span className="ml-3 rounded-md border border-line bg-nested px-2 py-0.5 text-[10px] text-muted">js-rea-studio.vercel.app</span><span className="ml-auto chip chip-ok" style={{ height: 16, fontSize: 8 }}>Analiz tamam</span></div>
      <div className="grid gap-2 p-3 md:grid-cols-[1fr_1fr] md:p-4">
        <div className="mock-card"><div className="text-[10px] font-semibold">Özellik akışı · “Kısayol kaydı nasıl başlatıyor?”</div>
          {['src/main/shortcuts.ts · registerGlobal()', 'ipc: “recording:start” → renderer', 'src/renderer/recorder.ts · start()'].map((x, i) => <div key={x} className="mt-1.5 flex items-center gap-1.5 text-[10px]"><span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-[8px] text-white">{i + 1}</span><code className="truncate text-muted">{x}</code></div>)}
          <div className="mt-2 text-[9px] text-[#ffb020]">REA’nın göremediği yer: native modül (1)</div></div>
        <div className="mock-card"><div className="text-[10px] font-semibold">JS Workspace’e taşıma planı</div>
          {['Modül: JS Media · kayıt başlatma', 'Veri: recordings(id, task_id, …)', 'Ekran: Görev ayrıntısı → Kayıt sekmesi', 'İzin: creative yazma, client okuma', 'Efor: 3 gün · Risk: düşük'].map((x) => <div key={x} className="mt-1.5 text-[10px] text-muted">• {x}</div>)}
          <div className="mt-2 flex gap-1.5"><span className="btn btn-sm" style={{ minHeight: 22, fontSize: 9, padding: '0 8px' }}>Kopyala</span><span className="btn btn-sm" style={{ minHeight: 22, fontSize: 9, padding: '0 8px' }}>.md indir</span></div></div>
      </div>
    </div>
  );
}

export function Mock({ kind }: { kind: ProductPageData['mock'] }) {
  switch (kind) {
    case 'board': return <BoardMock />;
    case 'chat': return <ChatMock />;
    case 'pipeline': return <PipelineMock />;
    case 'grid': return <GridMock />;
    case 'people': return <PeopleMock />;
    case 'finance': return <FinanceMock />;
    case 'admin': return <AdminMock />;
    case 'rea': return <ReaMock />;
  }
}

/** Ana sayfa "Nasıl çalışır" turu: 4 küçük kart. */
export function TourMock({ step }: { step: 0 | 1 | 2 | 3 }) {
  if (step === 0) return <HeroMock />;
  if (step === 1) return (
    <Shell active="inbox" title="Gelen Kutusu">
      <div className="mb-2 flex gap-2 text-[10px]">{['Kuyruk', 'Onay Merkezi', 'E-posta'].map((t, i) => <span key={t} className={`rounded-md px-2 py-0.5 ${i === 0 ? 'bg-ink text-canvas font-semibold' : 'text-muted'}`}>{t}</span>)}</div>
      <div className="mock-card">{[['Onay', 'Bütçe onayı · Nova lansman · ₺48.000', 'chip-brand'], ['Anma', '@sen: “Ambalaj revizesi için brief hazır mı?”', ''], ['Trello', 'Kart taşındı → Müşteri Onay · Acme #214', 'chip-ok'], ['Bugün', 'Zeta aylık rapor · 17:00', 'chip-warn'], ['Bildirim', 'Kurul planı onaylandı · 9 görev açıldı', '']].map(([k, t, c]) => <div key={t} className="flex items-center gap-2 border-t border-line py-1.5 text-[10px] first:border-0"><span className={`chip ${c}`} style={{ height: 16, fontSize: 8 }}>{k}</span><span className="truncate">{t}</span><span className="ml-auto text-muted">tamam</span></div>)}</div>
    </Shell>
  );
  if (step === 2) return <BoardMock />;
  return <ChatMock />;
}
