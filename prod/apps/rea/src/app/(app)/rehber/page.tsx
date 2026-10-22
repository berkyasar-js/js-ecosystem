import type { Metadata } from 'next';
import Link from 'next/link';
import { CommandBlock } from '@/components/copy';
import { PageHeader } from '@/components/ui';
import { GUIDE_COMMANDS as C, GUIDE_LEGAL, GUIDE_PITFALLS, GUIDE_PROMPTS as P, GUIDE_STEPS, GUIDE_WISPR, SERVER_LIMITS } from '@/lib/guide';

export const metadata: Metadata = { title: 'Rehber' };

export default function GuidePage() {
  return (
    <>
      <PageHeader eyebrow="Rehber · 25 dk · 5 adım" title="REA ile uygulamanın içini aç" sub="REA (Reverse Engineer Anything), kaynak kodu görmeden bir uygulamanın nasıl çalıştığını çıkaran açık kaynaklı (MIT) bir araç. Bu sayfa rehberin özeti ve kopyalanabilir komutları." />
      <div className="stack-y">
        <section className="card grid gap-3">
          <h2 className="h2">REA ne yapıyor?</h2>
          <ul className="list">
            <li>Electron ve JavaScript uygulamaları: modüller, import&apos;lar, uygulamanın kendi içindeki mesajlaşma (IPC).</li>
            <li>Web siteleri: sayfa yapısı, script&apos;ler, ağ istekleri (yerelde, çalışan bir Chrome&apos;a bağlanarak).</li>
            <li>Derlenmiş programlar: Hopper / Ghidra / IDA kuruluysa .NET, Android APK, SQLite ve birkaç format.</li>
            <li>Analiz senin bilgisayarında çalışır. REA her bulgunun kanıtını (dosya, satır) ve neyi bilemediğini de verir.</li>
          </ul>
          <p className="sub">Sonuçta üç şey: özelliğin adım adım akışı, her adımın kanıtı, aynı fikri kendi projende kurmak için plan. Gereken: Node.js 22.19+ ve npm.</p>
          <CommandBlock text={C.node} title="Node sürümünü kontrol et" />
        </section>

        <section className="card grid gap-3" aria-labelledby="steps-h">
          <h2 id="steps-h" className="h2">Adımlar</h2>
          {GUIDE_STEPS.map((s) => (
            <div key={s.n} className="nested">
              <div className="row" style={{ marginBottom: 4 }}><span className="chip chip-brand">Adım {s.n}</span><strong>{s.title}</strong></div>
              <p className="sub">{s.body}</p>
              {s.n === 1 && <><CommandBlock text={C.setup} title="Terminal" /><CommandBlock text={P.install} title="Ya da Claude Code'a yaptır (prompt)" /></>}
              {s.n === 2 && <CommandBlock text={P.ask} title="Prompt" />}
              {s.n === 3 && <><CommandBlock text={C.analyze} title="Tara" note="Kendi kurduğun, güvendiğin bir uygulamaysa komuta --integrity-policy record-and-continue ekleyebilirsin." /><CommandBlock text={C.summaryRequest} title="Özet isteğini hazırla (jq)" /><CommandBlock text={C.summaryView} title="Özet görünümü" /></>}
              {s.n === 4 && <CommandBlock text={C.trace} title="İsteğe bağlı: bir mesaj/metin tohumunu izle (trace-application-feature)" note={'Gerçek CLI\'da istek gövdesi: application alanına ham kanıt JSON\'u, seed alanına {kind, value, match: "exact"}. 0 sonuç \'yok\' demek değildir.'} />}
              {s.n === 5 && <CommandBlock text={P.port} title="Prompt" />}
            </div>
          ))}
        </section>

        <section className="card grid gap-3">
          <h2 className="h2">Web sitesi için yerel tarama</h2>
          <p className="sub">Bu uygulamanın URL modu tarayıcı açmaz. Giriş gerektiren ya da tarayıcıda dinamik yüklenen siteler için REA&apos;yı kendi Chrome&apos;una bağla:</p>
          <div className="cmd-steps">{C.web.map((c, i) => <CommandBlock key={i} text={c} title={['Chrome\'u uzaktan hata ayıklama portuyla aç', 'Sayfa hedefini bul', 'Paketi yakala ve analiz et'][i]} />)}</div>
          <CommandBlock text={C.help} title="Tüm komutlar (REA 6.x: 100+ alt komut)" />
        </section>

        <section className="card grid gap-3">
          <h2 className="h2">Örnek: Wispr Flow yazıyı nasıl yazıyor?</h2>
          <ol className="list" style={{ listStyle: 'decimal', paddingLeft: 20 }}>{GUIDE_WISPR.map((w, i) => <li key={i} style={{ paddingLeft: 4 }}>{w}</li>)}</ol>
          <div className="callout warn"><b>REA&apos;nın yetmediği yer.</b> &quot;Özelliği izle&quot; komutu bu akışı bulamadı; denenen 6 başlangıç noktasının hepsi 0 sonuç döndürdü. Zincir, taramadan sonra paketlenmiş kodda fonksiyon ve mesaj adları aranarak bulundu. REA tek başına cevabı vermiyor; ajanla birlikte kullanınca işe yarıyor. Her adımı kanıtıyla kontrol et.</div>
          <p className="sub">Demo modunda <Link className="text-button" href="/projeler">projeler</Link> listesinde bu örneğin bulgu sayfası hazır.</p>
        </section>

        <section className="card grid gap-3">
          <h2 className="h2">Püf noktaları</h2>
          <dl className="grid gap-3">{GUIDE_PITFALLS.map(([t, b]) => <div key={t} className="nested"><dt className="font-semibold">{t}</dt><dd className="sub mt-1">{b}</dd></div>)}</dl>
        </section>

        <section className="card grid gap-3">
          <h2 className="h2">Neyi inceleyebilirsin?</h2>
          <ul className="list">{GUIDE_LEGAL.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>

        <section className="card grid gap-3">
          <h2 className="h2">Bu uygulamanın sınırları</h2>
          <ul className="list">{SERVER_LIMITS.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      </div>
    </>
  );
}
