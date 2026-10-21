import type { Digest, Flow, Project } from './types';

/** "JS Ecosystem'e taşı": REA bulgusundan Türkçe taşıma planı (markdown). Deterministik, saf fonksiyon — test edilir. */

export interface PlanInput {
  project: Pick<Project, 'name' | 'question' | 'target_kind' | 'target_url'>;
  flow: Flow | null;
  digest: Digest | null;
  generatedAt?: string; // ISO; testlerde sabitlenir
}
export interface Effort { days: number; min: number; max: number; size: 'S' | 'M' | 'L' | 'XL'; rows: Array<{ item: string; days: number; why: string }> }

export function slugify(name: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  const s = name.replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c] ?? c).normalize('NFKD').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return s.slice(0, 28).replace(/_$/, '') || 'ozellik';
}

const MODULE_RULES: Array<{ re: RegExp; module: string; why: string }> = [
  { re: /görev|task|kart|board|trello/i, module: 'İş / Görevler (tasks, projects)', why: 'Akış iş kalemleriyle ilgili.' },
  { re: /onay|approve|approval/i, module: 'Onaylar (approvals)', why: 'Akışta onay/ret adımı var.' },
  { re: /otomasyon|webhook|olay|event|zamanla|schedule|cron/i, module: 'Otomasyon / olay işleyici (events dispatch)', why: 'Akış olay ya da zamanlayıcıyla tetikleniyor.' },
  { re: /yapay zek|ai\b|model|llm|prompt|düzelt|polish|çeviri|transcri|konuş|ses/i, module: 'Ajanlar (agents / agent_runs, kota)', why: 'Akışın bir adımı model çağrısı gerektiriyor; maliyet tavanı ve kayıt hazır altyapıda.' },
  { re: /müşteri|client|brand|marka/i, module: 'Müşteriler ve markalar (clients, brands)', why: 'Akış müşteri/marka kapsamıyla ilgili.' },
  { re: /entegrasyon|api|senkron|sync|bağlan/i, module: 'Entegrasyonlar (integrations)', why: 'Harici bir servisle veri alışverişi var.' },
];

function textOf(input: PlanInput): string {
  const f = input.flow;
  return [input.project.question, f?.summary, ...(f?.steps ?? []).flatMap((s) => [s.title, s.description])].filter(Boolean).join(' \n ');
}

/** Efor tahmini: iskelet 2 gün + adım başına güvene göre gün + yardımcı program + uç noktalar + kör noktalar. */
export function estimateEffort(input: PlanInput): Effort {
  const rows: Effort['rows'] = [{ item: 'İskelet: migration, RLS, modül klasörü, sözleşmeler', days: 2, why: 'Her taşımada sabit.' }];
  const steps = input.flow?.steps ?? [];
  for (const [i, s] of steps.entries()) {
    const d = s.confidence === 'yüksek' ? 1 : s.confidence === 'orta' ? 1.5 : 2.5;
    rows.push({ item: `Adım ${i + 1}: ${s.title}`, days: d, why: `Güven: ${s.confidence}${s.confidence === 'düşük' ? ' — önce doğrulama gerekli' : ''}` });
  }
  if (!steps.length) rows.push({ item: 'Akış henüz çıkarılmadı (AI sentez yok)', days: 3, why: 'Tahmin belirsiz; önce Bulgular sayfasında sentez çalıştır.' });
  const helper = !!input.flow?.has_helper || (input.digest?.helpers.length ?? 0) > 0;
  if (helper) rows.push({ item: 'Ayrı çalışan yardımcı program (masaüstü/native)', days: 5, why: 'Web uygulaması işletim sistemi düzeyinde iş yapamaz; ayrı bileşen gerekir.' });
  const endpoints = (input.digest?.items ?? []).filter((i) => i.kind === 'endpoint').length;
  if (endpoints) rows.push({ item: `Uç nokta karşılıkları (${Math.min(endpoints, 8)} adet)`, days: Math.min(endpoints, 8) * 0.5, why: 'Gözlenen her uç nokta için route handler + doğrulama.' });
  const blind = input.flow?.blind_spots.length ?? 0;
  if (blind) rows.push({ item: `REA kör noktalarını doğrulama (${Math.min(blind, 3)} adet)`, days: Math.min(blind, 3) * 0.5, why: 'Statik analizin göremediği yerler elle doğrulanmalı.' });
  rows.push({ item: 'Test, erişilebilirlik ve kabul', days: Math.max(1, Math.round(rows.reduce((a, r) => a + r.days, 0) * 0.2 * 2) / 2), why: 'Toplamın ~%20\'si.' });
  const days = Math.round(rows.reduce((a, r) => a + r.days, 0) * 2) / 2;
  const unsure = steps.filter((s) => s.confidence === 'düşük').length;
  const spread = unsure ? 0.4 : 0.25;
  return { days, min: Math.max(1, Math.floor(days * (1 - spread))), max: Math.ceil(days * (1 + spread)), size: days <= 5 ? 'S' : days <= 10 ? 'M' : days <= 20 ? 'L' : 'XL', rows };
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function generatePlan(input: PlanInput): { markdown: string; effort: Effort; slug: string } {
  const { project, flow, digest } = input;
  const slug = slugify(project.name);
  const effort = estimateEffort(input);
  const txt = textOf(input);
  const mods = MODULE_RULES.filter((r) => r.re.test(txt));
  const helper = !!flow?.has_helper || (digest?.helpers.length ?? 0) > 0;
  const endpoints = (digest?.items ?? []).filter((i) => i.kind === 'endpoint');
  const channels = (digest?.items ?? []).filter((i) => i.kind === 'ipc-channel' || i.kind === 'ipc-handler');
  const L: string[] = [];

  L.push(`# Taşıma planı: ${project.name}`, '');
  L.push(`> Hazırlayan: Jobs Studio · Ters Mühendislik Stüdyosu${input.generatedAt ? ` · ${input.generatedAt.slice(0, 10)}` : ''}`);
  L.push('> Bu plan REA statik analiz bulgularından türetildi. **Bulunan kodu kopyalamayın; fikri anlayıp kendi kodunuzla kurun.** İncelenen ürünün kullanım koşullarını kontrol edin; şifre, lisans ya da güvenlik önlemi aşmak için kullanmayın.', '');

  L.push('## 1. Amaç', '');
  L.push(project.question ? `**Soru:** ${project.question}` : '**Soru:** (girilmemiş)', '');
  if (flow?.summary) L.push(flow.summary, '');
  if (project.target_url && project.target_kind === 'web') L.push(`Hedef: ${project.target_url}`, '');

  L.push('## 2. Çıkarılan akış', '');
  if (flow?.steps.length) {
    flow.steps.forEach((s, i) => {
      L.push(`${i + 1}. **${s.title}** (güven: ${s.confidence})`, `   ${s.description}`);
      for (const e of s.evidence) L.push(`   - Kanıt: ${[e.symbol && `\`${e.symbol}\``, e.file && `\`${e.file}\``].filter(Boolean).join(' · ') || 'yer belirtilmemiş'}`);
    });
  } else L.push('_Akış henüz çıkarılmadı. Bulgular sayfasında "AI sentez" çalıştırın; plan o zaman somutlaşır._');
  L.push('');

  L.push('## 3. JS Ecosystem\'de karşılığı', '', '### 3.1 Modül', '');
  if (mods.length) { L.push('| Dokunulacak mevcut modül | Neden |', '|---|---|'); mods.forEach((m) => L.push(`| ${m.module} | ${m.why} |`)); }
  else L.push('Mevcut modüllerle belirgin bir örtüşme yok; bağımsız yeni modül olarak kurulur.');
  L.push('', `Yeni modül adı önerisi: \`${slug}\` — kod \`apps/web/src/lib/${slug}/\`, ekranlar \`/app/${slug.replace(/_/g, '-')}\`, sözleşmeler \`packages/contracts\`.`, '');

  L.push('### 3.2 Veri modeli', '');
  L.push('Önerilen taslak (kesinleştirmeden önce adımlara göre daraltın):', '', '```sql',
    `-- migration: 00NN_${slug}.sql (sıradaki boş numara)`,
    `create table public.${slug}_items (`,
    '  id uuid primary key default gen_random_uuid(),',
    '  org_id uuid not null references public.organizations(id) on delete cascade,',
    '  created_by uuid references auth.users(id),',
    "  status text not null default 'draft',",
    '  payload jsonb not null default \'{}\',',
    '  created_at timestamptz not null default now()',
    ');',
    `create table public.${slug}_events (  -- her akış adımının kaydı (denetim + hata ayıklama)`,
    '  id uuid primary key default gen_random_uuid(),',
    `  item_id uuid not null references public.${slug}_items(id) on delete cascade,`,
    '  org_id uuid not null,',
    '  step text not null,',
    '  ok boolean not null,',
    '  detail jsonb,',
    '  at timestamptz not null default now()',
    ');',
    `-- RLS: core.has_role(org_id, array['owner','org_admin',...]::core.app_role[])`,
    '```', '');
  if (flow?.steps.length) { L.push('Adım → tablo/alan eşlemesi:', ''); flow.steps.forEach((s, i) => L.push(`- Adım ${i + 1} (${s.title}) → \`${slug}_events.step = '${slugify(s.title)}'\` kaydı; sonucu \`ok/detail\` alanlarında`)); L.push(''); }

  L.push('### 3.3 Ekranlar', '', `- Liste: \`/app/${slug.replace(/_/g, '-')}\` — durum, son çalışma, filtre`, '- Detay: akışın adım adım durumu (başarılı / başarısız / atlandı), hata ayrıntısı', '- Ayarlar: kota, açma/kapama, yetki', helper ? '- Yardımcı program durumu: kurulu mu, sürüm, son görülme, yeniden başlatma' : '- (Yardımcı program yok; ekran sayısı azalır)', '');

  L.push('### 3.4 API', '');
  L.push(`- \`POST /api/${slug.replace(/_/g, '-')}\` — akışı başlatır (zod ile doğrulama, org kapsamı)`, `- \`GET /api/${slug.replace(/_/g, '-')}/[id]\` — durum yoklaması (uzun işlerde)`);
  if (endpoints.length) { L.push('', 'Analizde gözlenen uç noktalar ve bizdeki karşılık adayları:', '', '| Gözlenen | Mekanizma | Nerede | Bizim karşılığı |', '|---|---|---|---|'); endpoints.slice(0, 12).forEach((e) => L.push(`| \`${esc(e.label)}\` | ${esc(e.note ?? '—')} | ${e.file ? `\`${esc(e.file)}${e.line ? `:${e.line}` : ''}\`` : '—'} | route handler + zod şeması |`)); }
  if (channels.length) { L.push('', 'Uygulama içi mesajlar (IPC) — web\'de server action / route handler\'a çevrilir:', ''); channels.slice(0, 12).forEach((c) => L.push(`- \`${c.label}\`${c.file ? ` (\`${c.file}${c.line ? `:${c.line}` : ''}\`)` : ''}`)); }
  L.push('');

  L.push('### 3.5 İşletim sistemi / ortam izinleri', '');
  if (helper) {
    L.push('Analiz, işi ayrı çalışan bir yardımcı programın yaptığını gösteriyor. Tarayıcıdaki web uygulaması bunu tek başına yapamaz:', '');
    (flow?.helper_programs ?? []).forEach((h) => L.push(`- **${h.name}**${h.path ? ` (\`${h.path}\`)` : ''}: ${h.role}`));
    (digest?.helpers ?? []).slice(0, 6).forEach((h) => L.push(`- \`${h.path}\` — ${h.why}`));
    L.push('', '- Karar: (a) masaüstü yardımcı (Electron/Tauri + küçük native bileşen), (b) tarayıcı eklentisi, (c) kapsamı webde yapılabilene daraltmak.', '- Hangi adımın işletim sistemi izni (ör. Mac\'te Erişilebilirlik, mikrofon) gerektirdiğini belirleyin ve ilk çalıştırmada kullanıcıya açıklayın.');
  } else L.push('Analizde ayrı çalışan bir yardımcı programa dair kanıt bulunmadı. **Bu, olmadığı anlamına gelmez** (REA bunu garanti etmez); paket klasörünü elle kontrol edin.');
  L.push('');

  L.push('## 4. Riskler', '', '| Risk | Etki | Önlem |', '|---|---|---|');
  L.push('| İncelenen ürünün kullanım koşulları tersine mühendisliği yasaklıyor olabilir | Hukuki | Koşulları okuyun; yalnızca fikri/mimariyi örnek alın, kod ve varlık kopyalamayın |');
  (flow?.steps ?? []).forEach((s, i) => { if (s.confidence === 'düşük') L.push(`| Adım ${i + 1} (${esc(s.title)}) düşük güvenli | Yanlış mimari | İlk iş olarak küçük bir doğrulama denemesi (spike) |`); });
  (flow?.blind_spots ?? []).forEach((b) => L.push(`| REA kör noktası: ${esc(b.title)} | Eksik adım | ${esc(b.detail)} |`));
  if (helper) L.push('| Platforma bağlı yardımcı program | Bakım yükü, izin sürtünmesi | Yalnızca gerekli platformu destekleyin; hatada zarif geri dönüş (örn. panoya kopyala) |');
  L.push('| Statik analiz çalışma zamanı davranışını kanıtlamaz | Yanlış varsayım | Her adımı kendi prototipinizde uçtan uca doğrulayın |', '');

  L.push('## 5. Tahmini efor', '', `**Toplam: ~${effort.days} gün (${effort.min}–${effort.max} gün aralığı), beden: ${effort.size}.** Tek geliştirici, mevcut JS Ecosystem altyapısı üzerinde.`, '', '| Kalem | Gün | Not |', '|---|---:|---|');
  effort.rows.forEach((r) => L.push(`| ${esc(r.item)} | ${r.days} | ${esc(r.why)} |`));
  L.push('');

  L.push('## 6. Önerilen sıra', '', '1. **Doğrulama (spike):** düşük güvenli adımlar ve REA kör noktaları için küçük deneme.', '2. **Veri + RLS:** migration, sözleşmeler, `core.has_role` politikaları.', '3. **API:** route handler\'lar ve ajan/kota entegrasyonu.', '4. **Ekranlar:** liste, detay, ayarlar.', helper ? '5. **Yardımcı program:** ayrı bileşen, izin akışı, yeniden başlatma.' : '5. **Sertleştirme:** hata durumları, günlükleme.', '6. **Kabul:** aşağıdaki ölçütler.', '');

  L.push('## 7. Kabul ölçütleri', '');
  if (flow?.steps.length) flow.steps.forEach((s, i) => L.push(`- [ ] Adım ${i + 1} — ${s.title}: kendi uygulamamızda çalışıyor ve \`${slug}_events\` kaydı oluşuyor`));
  L.push('- [ ] Yalnızca yetkili roller erişebiliyor (RLS testi)', '- [ ] Hata durumunda kullanıcıya anlaşılır Türkçe mesaj', '- [ ] Hiçbir yerde incelenen üründen alınmış kod/varlık yok', '');

  if (digest?.items.length) {
    L.push('## Ek: Kanıt dizini', '', '| Tür | Ad | Dosya |', '|---|---|---|');
    digest.items.slice(0, 25).forEach((i) => L.push(`| ${esc(i.kind)} | \`${esc(i.label)}\` | ${i.file ? `\`${esc(i.file)}${i.line ? `:${i.line}` : ''}\`` : '—'} |`));
    L.push('');
  }
  return { markdown: L.join('\n'), effort, slug };
}
