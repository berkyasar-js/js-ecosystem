import Link from 'next/link';
import { BOARD_AGENTS, MODULES, NAV_GROUPS } from '@jscore/contracts';
import { HeroMock, TourMock } from '@/components/mockups';
import { Check, CtaBand, Feature, Section, StatusChip } from '@/components/ui';
import { IconArrow, IconBoard, IconBot, IconChart, IconFlow, IconInbox, IconKey, IconLayers, IconLock, IconPlug, IconShield, IconSpark, IconUsers } from '@/components/icons';
import { INTEGRATIONS, PLANS } from '@/content/platform';
import { SITE } from '@/content/site';

const AGENT_TITLES: Record<string, string> = { chair: 'CHAIR · kurul başkanı', ceo: 'CEO · strateji', cfo: 'CFO · marj & nakit', coo: 'COO · operasyon', cmo: 'CMO · pazarlama', cto: 'CTO · teknoloji', chro: 'CHRO · insan', cco: 'CCO · müşteri', clo: 'CLO · hukuk & uyum' };

const TOUR: Array<{ title: string; desc: string; href: string }> = [
  { title: 'Ana Sayfa', desc: 'Bugünün planı, senden bekleyenler, ekip nabzı ve kurul kararları — role göre.' },
  { title: 'Gelen Kutusu', desc: 'Tek kuyruk: bildirim, onay, anma, Trello değişiklikleri ve bugün bitenler. “Tamam” de, geç.' },
  { title: 'Projeler', desc: '8 aşamalı pano, akış planı ve Trello kartının her ayrıntısı (checklist, yorum, ek, kapak).' },
  { title: 'Kurul', desc: 'Dokuz ajan tartışır, CHAIR plan çıkarır, kurucu karar verir, plan onay kartıyla uygulanır.' },
].map((t, i) => ({ ...t, href: ['/urun', '/urun', '/urun/projeler', '/urun/kurul'][i] }));

export default function Home() {
  const liveModules = MODULES.filter((m) => m.group !== 'hidden');
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="hero-glow" aria-hidden="true" />
        <div className="bg-grid absolute inset-0 -z-10" aria-hidden="true" />
        <div className="wrap relative pb-8 pt-14 md:pt-24">
          <div className="mx-auto max-w-4xl text-center">
            <p className="chip chip-ai mx-auto mb-5"><IconSpark size={12} /> Yeni: Kurul Sohbeti ve onay kartlı ajan planları</p>
            <h1 className="text-[40px] leading-[1.05] md:text-7xl">Ajanslar için yapay zekâ destekli <span className="bg-gradient-to-r from-[#8c93ff] via-[#00f0ff] to-[#ccff00] bg-clip-text text-transparent">çalışma alanı</span></h1>
            <p className="lede mx-auto mt-6 max-w-2xl">Projeler, müşteriler, üretim, ekip ve finans tek yerde. Dokuz kişilik yapay zekâ yönetim kurulu plan çıkarır; siz onaylarsınız. Trello’dan iki yönlü senkronla, veri kaybetmeden geçin.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/demo" className="btn btn-primary btn-lg">Demo talep et <IconArrow size={16} /></Link>
              <a href={SITE.loginUrl} className="btn btn-lg" rel="noopener">Demo modunda dene</a>
            </div>
            <p className="mt-4 text-xs text-muted">Kredi kartı yok · Demo modu veritabanı istemez · Türkçe arayüz</p>
          </div>
          <div className="glow relative mx-auto mt-12 max-w-5xl rounded-[18px]"><HeroMock /></div>
        </div>
      </section>

      {/* 9 alan */}
      <section className="wrap py-10">
        <ul className="marquee" aria-label="Dokuz üst alan">
          {NAV_GROUPS.map((g) => <li key={g.id} className="chip" style={{ height: 30, fontSize: 12, padding: '0 14px' }}>{g.label}</li>)}
        </ul>
      </section>

      {/* NASIL ÇALIŞIR */}
      <Section id="nasil-calisir" eyebrow="Nasıl çalışır" title="Sabah Ana Sayfa’dan başla, akşam Kurul’a bırak" lede="Dört ekranla günün tamamı: ne yapılacak, senden ne bekleniyor, işler nerede, strateji ne diyor.">
        <ol className="grid gap-6 md:grid-cols-2">
          {TOUR.map((t, i) => (
            <li key={t.title} className="card grid gap-4">
              <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span><h3 className="text-lg">{t.title}</h3></div>
              <TourMock step={i as 0 | 1 | 2 | 3} />
              <p className="text-sm text-muted">{t.desc}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* MODÜL GRID */}
      <Section id="moduller" eyebrow="Modüller" title={<>{liveModules.length} modül, tek veri katmanı</>} lede="Her modül aynı Repo katmanından, aynı izin tablosundan ve aynı olay hattından geçer. Panelden tek tek açılıp kapatılır.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {liveModules.slice(0, 16).map((m) => (
            <Link key={m.id} href={`/moduller#${m.id}`} className="nested flex flex-col gap-1 transition hover:border-brand-ink/50">
              <span className="text-sm font-semibold">{m.name}</span>
              <span className="text-xs text-muted">{m.desc}</span>
            </Link>
          ))}
        </div>
        <div className="mt-6"><Link href="/moduller" className="btn">Tüm katalog ({liveModules.length}) <IconArrow size={14} /></Link></div>
      </Section>

      {/* AJANLAR */}
      <section className="relative overflow-hidden py-6">
        <div className="hero-glow opacity-60" aria-hidden="true" />
        <Section eyebrow="Yapay zekâ" title="Dokuz kişilik yönetim kurulu — onay kapılı, bütçe tavanlı" lede="Ajanlar öneri üretir, plan çıkarır ve ancak siz onaylayınca yazar. Her çalıştırma token ve maliyetiyle günlüğe düşer; tavan aşılınca durur.">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="grid grid-cols-3 gap-2">
              {BOARD_AGENTS.map((a) => (
                <div key={a} className="card flex flex-col gap-1 p-4">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#2f2a55] text-xs font-bold text-[#c9bbff]">{a.toUpperCase()}</span>
                  <span className="mt-1 text-xs text-muted">{AGENT_TITLES[a]}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-3">
              <Feature icon={<IconBot />} title="Kurul Sohbeti">Konu + markdown dosyası ver; CHAIR görev dağılımı, yapılacaklar, kilometre taşları, riskler ve açık sorularla döner.</Feature>
              <Feature icon={<IconShield />} title="Ajan modları ve onay kartları">Sor (salt okunur) · Planla (onayla uygula) · Uygula (otomatik, sınırlı). Plan bir onay kaydıdır; onaylanınca görevler açılır.</Feature>
              <Feature icon={<IconChart />} title="Bütçe tavanı">Aylık tavan; “Bu ay ₺612 / ₺2.000”. Aşımda 402 ile durur. Ajans planına ₺2.000/ay bütçe dahildir.</Feature>
            </div>
          </div>
          <div className="mt-6"><Link href="/urun/kurul" className="btn">Kurul & ajanları incele <IconArrow size={14} /></Link></div>
        </Section>
      </section>

      {/* ENTEGRASYON ŞERİDİ */}
      <Section eyebrow="Entegrasyonlar" title="Trello’yu bırakmadan başla, sonra kapat" lede="İki yönlü senkron, webhook’lar, saatlik uzlaştırma ve kart ayrıntıları. Trello’yu kapattığınızda veriler, projeler ve günlük kalır.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((i) => (
            <li key={i.id}><Link href={`/entegrasyonlar#${i.id}`} className="nested flex h-full items-center justify-between gap-3 transition hover:border-brand-ink/50"><span className="flex items-center gap-2.5 text-sm font-semibold"><IconPlug size={16} className="text-brand-ink" />{i.name}</span><StatusChip status={i.status} /></Link></li>
          ))}
        </ul>
      </Section>

      {/* GÜVENLİK */}
      <Section eyebrow="Güvenlik" title="Veritabanında uygulanan yetki, panelden yönetilen politika">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Feature icon={<IconLock />} title="RLS + 14 rol">Her sorgu kullanıcının JWT’si ile; organizasyon, rol ve kapsam Postgres’te uygulanır.</Feature>
          <Feature icon={<IconKey />} title="MFA ve alan adı kısıtı">TOTP zorunluluğu, Google girişinde izinli e-posta alan adları, oturum süresi.</Feature>
          <Feature icon={<IconLayers />} title="Denetim kaydı">Her yönetim eylemi (başarı ve hata) audit_events’e; entegrasyon senkronu ayrı günlükte.</Feature>
          <Feature icon={<IconShield />} title="Sırlar sunucuda">Servis anahtarı istemciye inmez; Trello/HubSpot sırları sütun düzeyinde gizli, API anahtarları yalnızca sha256.</Feature>
        </div>
        <div className="mt-6"><Link href="/guvenlik" className="btn">Güvenlik ayrıntıları <IconArrow size={14} /></Link></div>
      </Section>

      {/* FİYAT TEASER */}
      <Section eyebrow="Fiyatlandırma" title="Koltuk başına, lansman fiyatıyla" lede="Üç plan, KDV hariç TRY. Modül kapalıysa faturaya yansımaz.">
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.id} className={`card flex flex-col gap-3 ${p.highlight ? 'glow border-brand-ink/50' : ''}`}>
              <div className="flex items-center justify-between"><h3 className="text-lg">{p.name}</h3>{p.highlight && <span className="chip chip-lime">Popüler</span>}</div>
              <p className="text-3xl font-bold">{p.price}<span className="text-sm font-medium text-muted">{p.unit}</span></p>
              <p className="text-sm text-muted">{p.blurb}</p>
              <ul className="grid gap-2">{p.includes.slice(0, 3).map((x) => <Check key={x}>{x}</Check>)}</ul>
              <Link href="/fiyatlandirma" className={`btn mt-auto ${p.highlight ? 'btn-primary' : ''}`}>Karşılaştır</Link>
            </div>
          ))}
        </div>
      </Section>

      {/* Neden */}
      <Section eyebrow="Neden JS Workspace" title="Ajans için yazıldı; bir ajansın içinde kullanılıyor">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={<IconFlow />} title="Ajans akışı yerleşik">Brief → Kapsam → Plan → Üretim → İç revize → Onay → Teslim. Kota aşımı otomatik “kapsam dışı” onayına gider.</Feature>
          <Feature icon={<IconInbox />} title="Tek kuyruk">Bildirim, onay, anma, Trello değişikliği ve teslim aynı listede. ⌘K ile her şeye, ⌘J ile “bugün ne teslim?” sorusuna.</Feature>
          <Feature icon={<IconUsers />} title="Müşteri de içeride">Client Admin / Viewer yalnızca kendi markasını görür; onay verir, talep açar, dosya indirir.</Feature>
          <Feature icon={<IconBoard />} title="Trello geçişi planlı">Paralel dönem → yalnızca Trello→JS → kapalı. Hiçbir adımda veri silinmez.</Feature>
          <Feature icon={<IconPlug />} title="Açık uçlar">MCP uç noktası, API anahtarları, HMAC imzalı webhook’lar ve olay→aksiyon otomasyonları.</Feature>
          <Feature icon={<IconSpark />} title="Türkçe, ilk günden">Arayüz, ajan çıktıları, hata mesajları ve belgeler Türkçe. TRY, Europe/Istanbul varsayılan.</Feature>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
