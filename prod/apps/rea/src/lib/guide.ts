/** Rehber içeriği (kullanıcının sağladığı "REA ile uygulamanın içini aç" rehberinin özeti + gerçek CLI'ya göre eklemeler). */

export const GUIDE_PROMPTS = {
  install: `morluto/rea reposunu (REA: Reverse Engineer Anything) Claude Code'a kur. Resmi kurulum komutu \`npx rea-agents setup\`. Kurulum hangi dosyaları değiştirecekse önce bana göster, onay vermeden yazma. Bitince yeniden başlatmam gerekiyorsa söyle.`,
  ask: `REA ile Wispr Flow uygulamasını incele (/Applications/Wispr Flow.app). Konuşmayı bitirdiğimde yazının imlecin olduğu kutuya nasıl yazıldığını bul.
1. Bu akışı adım adım çıkar: hangi parça hangisini çağırıyor.
2. Her adım için kanıt göster: dosya yolu ve ilgili fonksiyon ya da mesaj adı. Uzun kod parçası kopyalama, 2-3 satır yeter.
3. Emin olmadığın ya da REA'nın göremediği yerleri ayrıca yaz.
4. Uygulamanın içinde ayrı çalışan bir program varsa onu da belirt.`,
  port: `Wispr Flow'da bulduğumuz akışı (metni hazırla → hedef kutu yazılabilir mi kontrol et → yazmayı ayrı küçük bir yardımcı programa yaptır → yazıldığını doğrula) kendi projem için tasarla.
1. Wispr Flow'un kodunu kopyalama; yalnız mimariyi örnek al.
2. Projemin diline ve yapısına uygun en sade çözümü öner.
3. Hangi adımın işletim sistemi izni gerektirdiğini (ör. Mac'te Erişilebilirlik) ayrıca yaz.
4. Kodu yazmadan önce planı bana göster.`,
} as const;

export const GUIDE_COMMANDS = {
  node: 'node -v',
  setup: 'npx rea-agents setup',
  analyze: `npx -y rea-agents@latest analyze-javascript-application "/Applications/Wispr Flow.app/Contents/Resources/app.asar" --json > wispr.json`,
  summaryRequest: `jq -c '{source: {kind: "inline", evidence: .}, view: {kind: "summary"}}' wispr.json > ozet-istek.json`,
  summaryView: 'npx -y rea-agents@latest inspect-analysis-view ozet-istek.json',
  trace: `# ham kanıt dosyasını "application" alanına koyup bir kanal/metin tohumuyla izle
jq -c '{application: ., seed: {kind: "string", value: "PasteText", match: "exact"}}' wispr.json > izle-istek.json
npx -y rea-agents@latest trace-application-feature izle-istek.json`,
  integrity: '--integrity-policy record-and-continue',
  web: [
    'google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/rea-chrome "https://ornek.com"',
    'npx -y rea-agents@latest list-browser-targets http://127.0.0.1:9222',
    'npx -y rea-agents@latest analyze-web-bundle http://127.0.0.1:9222 <targetId> --fetch-source-maps --json > site.json',
  ],
  help: 'npx -y rea-agents@latest --help',
} as const;

export const GUIDE_STEPS = [
  { n: 1, title: 'REA\'yı kur', body: 'Terminalde kurulum hangi ajanları bağlamak istediğini sorar; Claude Code\'u seç. Değişiklik yapmadan önce hangi dosyaya ne yazacağını gösterip onay ister, mevcut ayarların yedeğini alır. Kurulum bitince Claude Code\'u kapatıp yeniden aç. Yalnız JavaScript/Electron bakacaksan Hopper kurmana gerek yok.' },
  { n: 2, title: 'İlk soruyu sor', body: 'Uygulama adını ve merak ettiğin özelliği değiştirerek kalıbı kullan. Soru ne kadar dar olursa cevap o kadar iyi: "Bu uygulama nasıl çalışıyor?" yerine "şu butona basınca ne oluyor?"' },
  { n: 3, title: 'Terminalden hızlı tarama (isteğe bağlı)', body: 'Electron uygulamalarında kod app.asar dosyasında durur. REA\'yı doğrudan çalıştırıp çıktıyı JSON\'a yaz; çıktı büyüktür (Wispr Flow\'da 59 MB). Özet görünümüyle genel resmi gör. Wispr Flow taramasında ~82 sn sürdü: 167 JS dosyası, 1.428 modül, 207 IPC.' },
  { n: 4, title: 'Bulguyu oku ve doğrula', body: 'Ajanın verdiği her adımı kanıtıyla kontrol et: dosya, fonksiyon, mesaj adı. REA\'nın göremediği yerleri ayrıca not et. REA tek başına cevap vermeyebilir; ajanla birlikte, paket içinde fonksiyon ve mesaj adı arayarak işe yarar.' },
  { n: 5, title: 'Öğrendiğini kendi projene taşı', body: 'Akışı anladıktan sonra aynı fikri kendi kodunla kur. Kodu kopyalama; mimariyi örnek al. Bu uygulamadaki "JS Ecosystem\'e taşı" sekmesi bu adımı plan olarak üretir.' },
] as const;

export const GUIDE_WISPR = [
  'Konuşursun. Ses yazıya çevrilir.',
  'Yapay zekâ metni düzeltir. Bu adım başarısız olursa ham metin kullanılır (kodda PrePastePolish).',
  'İmleç yazılabilir bir kutuda mı? Uygulama önce bunu sorar (getTextBoxInfo). Değilse metni yapıştırmaz, bildirim olarak gösterir.',
  'Yazıyı gizli küçük bir program yazar. Metni Electron yapıştırmaz; paketin içindeki swift-helper-app-dist klasöründe Swift ile yazılmış ayrı bir uygulamaya PasteText isteği gider. O program kapanmışsa yeniden başlatılır (pasteTextAndRelaunchHelperIfNeeded).',
  'Gerçekten yazıldı mı? Yapıştırmadan önce ve sonra kutudaki metne bakılıp yazının gerçekten çıktığı kontrol edilir.',
] as const;

export const GUIDE_PITFALLS: Array<[string, string]> = [
  ['artifact_integrity_mismatch hatası', 'Paket imzalandıktan sonra bazı dosyalar değişmiş olabilir; REA bunu fark edip durur. Kendi kurduğun, güvendiğin bir uygulamaysa komuta --integrity-policy record-and-continue ekle. Bu uygulama sunucu çalıştırmalarında bunu varsayılan olarak ekler.'],
  ['Node sürümü hatası', 'REA Node.js 22.19 ya da üstünü ister. node -v ile kontrol et.'],
  ['Uygulamanın kodu JavaScript değil', 'Safari, Notlar gibi uygulamalar makine koduna derlenmiş. Bunlar için REA\'nın Hopper, Ghidra ya da IDA ile çalışması gerekir (yerel kurulum; bu uygulama yalnız JS/web analizi yapar).'],
  ['"İzle" komutu 0 sonuç veriyor', 'Özelliğin olmadığı anlamına gelmez; REA bunu çıktısında söyler. Paket içinde fonksiyon ve mesaj adı aramak gerekir. Projeye "aranacak adlar" girersen bu uygulama paket kaynağında kendisi arar.'],
  ['Cevap çok genel', 'Soruyu daralt: tek bir buton, tek bir kısayol, tek bir ekran.'],
];

export const GUIDE_LEGAL = [
  'Bunu öğrenmek için kullan. Bulduğun kodu kopyalayıp kendi ürününe koyma; fikri anla, kendi kodunla yaz.',
  'Uygulamanın kullanım koşullarına bak. Bazıları tersine mühendisliği açıkça yasaklıyor.',
  'Şifreleri, lisans kontrollerini ya da güvenlik önlemlerini aşmak için kullanma.',
] as const;

export const SERVER_LIMITS = [
  'Sunucu çalıştırması Vercel işlevinde en çok 300 sn sürer; büyük paketlerde analiz süre sınırına takılabilir.',
  'Yükleme sınırı 45 MB (.asar / .zip / REA .json). Daha büyük paketler için "Bilgisayarımda" modunu kullan.',
  'URL analizi tarayıcı açmaz: sayfa ve script dosyaları indirilip statik analiz edilir. Giriş gerektiren sayfalar, sonradan yüklenen kod ve ağ trafiği görünmez.',
  'Sunucu yalnızca JavaScript / Electron ve web script analizi yapar; Hopper, Ghidra, adb gibi araçlar gerektiren derlenmiş uygulama analizi yerel çalışır.',
  'asar dışındaki yardımcı programlar (Contents/MacOS, app.asar.unpacked) yalnızca .zip içinde gönderilirse görünür.',
] as const;
