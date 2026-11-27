/**
 * Ajan tiplemeleri: önceden tasarlanmış 12 karakter. Her çalıştırmada rol bir tiplemeyle temsil edilir
 * (varsayılan: rolün bölümüne göre otomatik; görevlendirirken elle seçilebilir, `agent_runs.input.persona`).
 * Portreler yapay zekâ ile üretilmiş KURGUSAL kişilerdir; gerçek kişileri temsil etmez.
 * Görseller: apps/web/public/agency/personas/<id>.webp (512×512).
 */
export interface AgentPersona {
  id: string;
  /** Karakter adı (kurgusal). */
  name: string;
  /** Tipleme unvanı. */
  title: string;
  /** Kısa karakter tarifi. */
  blurb: string;
  /** Bu tiplemenin varsayılan temsil ettiği bölümler. */
  divisions: string[];
  image: string;
}
const P = (id: string, name: string, title: string, blurb: string, divisions: string[]): AgentPersona =>
  ({ id, name, title, blurb, divisions, image: `/agency/personas/${id}.webp` });

export const PERSONAS: AgentPersona[] = [
  P('architect', 'Deniz', 'Yazılım Mimarı', 'Sakin, sistemli; önce yapıyı kurar, sonra kodu yazar.', ['engineering']),
  P('security', 'Leyla', 'Güvenlik Uzmanı', 'Tetikte ve ölçülü; her girdiyi şüpheyle okur.', ['security']),
  P('creative', 'Selin', 'Kreatif Direktör', 'Sıcak ve meraklı; fikri görsele çevirir.', ['design']),
  P('marketing', 'Mina', 'Pazarlama Stratejisti', 'Enerjik; hedef kitleyi ve kanalı birlikte düşünür.', ['marketing']),
  P('media', 'Kaan', 'Performans Medya Uzmanı', 'Hızlı ve sayılarla konuşur; bütçeyi sonuca bağlar.', ['paid-media']),
  P('sales', 'Baran', 'Satış Danışmanı', 'İkna edici ve güler yüzlü; ihtiyacı dinleyerek satar.', ['sales']),
  P('product', 'Defne', 'Ürün Yöneticisi', 'Kararlı; kapsamı, önceliği ve takvimi netleştirir.', ['product', 'project-management']),
  P('analyst', 'Nesrin', 'Araştırma Analisti', 'Titiz ve sorgulayıcı; iddiayı kanıtla tartar.', ['research', 'academic', 'gis']),
  P('quality', 'Tolga', 'Kalite Denetçisi', 'Şüpheci; kanıt görmeden “hazır” demez.', ['testing']),
  P('finance', 'Zeynep', 'Finans Danışmanı', 'Net ve dikkatli; rakamı ve riski birlikte okur.', ['finance']),
  P('artist', 'Arda', 'Oyun & 3B Sanatçısı', 'Oyunbaz; mekân, hareket ve etkileşimle düşünür.', ['game-development', 'spatial-computing']),
  P('operations', 'Elif', 'Operasyon & Müşteri Uzmanı', 'Güven veren; süreci ve insanı birlikte yönetir.', ['support', 'healthcare', 'specialized']),
];
export const DEFAULT_PERSONA_ID = 'operations';
export const personaById = (id: string | null | undefined): AgentPersona | undefined => PERSONAS.find((p) => p.id === id);

/** "Uzmanlık" bölümü karışıktır: rol adındaki ipucuna göre daha uygun tiplemeye yönlendirilir. */
const SPECIALIZED_HINTS: Array<[RegExp, string]> = [
  [/financ|loan|billing|accounts-payable|payable/, 'finance'],
  [/sales|outreach|real-estate/, 'sales'],
  [/privacy|identity|trust|zk|governance/, 'security'],
  [/legal|compliance|document-review/, 'quality'],
  [/data|report|lsp|index|extraction|consolidation/, 'analyst'],
  [/strateg|business|ma-integration|orchestrator|operations-manager|change-management/, 'product'],
  [/translator|grant|resume|training|study/, 'creative'],
];

/** Rolün varsayılan tiplemesi (deterministik). */
export function personaFor(role: { slug: string; division: string }): AgentPersona {
  if (role.division === 'specialized') {
    const hint = SPECIALIZED_HINTS.find(([re]) => re.test(role.slug));
    if (hint) return personaById(hint[1])!;
  }
  return PERSONAS.find((p) => p.divisions.includes(role.division)) ?? personaById(DEFAULT_PERSONA_ID)!;
}
/** Çalıştırmada görünen tipleme: elle seçilen geçerliyse o, değilse rolün varsayılanı. */
export const personaForRun = (role: { slug: string; division: string }, chosen?: string | null): AgentPersona =>
  personaById(chosen) ?? personaFor(role);
