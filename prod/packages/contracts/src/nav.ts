import { z } from 'zod';
import type { Role } from './index';

/* ───────── Gruplu gezinme (Volobox ruhu: ~9 üst alan) ─────────
 * Kullanıcı uygulamasının kenar çubuğu uzun düz modül listesi yerine bu grupları gösterir.
 * Her grup bir ana rota + alt modüller taşır; alt modüllerin kendi URL'leri (/app/<slug>) değişmez.
 */
export type NavGroupId = 'home' | 'inbox' | 'projects' | 'clients' | 'production' | 'team' | 'finance' | 'messages' | 'apps';
export interface NavGroup {
  id: NavGroupId;
  label: string;
  /** Grubun ana rotası. */
  href: string;
  /** ICONS anahtarı (apps/web components/icons.ts). */
  icon: string;
  /** Grubun kapsadığı modül kimlikleri (MODULES.id). İlk modül grubun "ana" modülüdür. */
  modules: string[];
  /** Alt sekmeler: etiket + rota (modül slug'ı ile). Boşsa grup tek sayfadır. */
  children: Array<{ module: string; label: string; href: string }>;
  /** Mobil alt sekme çubuğunda yer alır (en önemli 5). */
  mobile?: boolean;
}
const G = (id: NavGroupId, label: string, href: string, icon: string, modules: string[], children: Array<[string, string, string?]> = [], mobile = false): NavGroup => ({
  id, label, href, icon, modules, mobile, children: children.map(([module, l, h]) => ({ module, label: l, href: h ?? `/app/${module}` })),
});
export const NAV_GROUPS: NavGroup[] = [
  G('home', 'Ana Sayfa', '/app/overview', 'dashboard', ['overview'], [], true),
  G('inbox', 'Gelen Kutusu', '/app/inbox', 'inbox', ['inbox', 'approvals'], [['inbox', 'Kuyruk'], ['approvals', 'Onay Merkezi'], ['inbox', 'E-posta', '/app/inbox?tab=email']], true),
  G('projects', 'Projeler', '/app/projects', 'projects', ['projects', 'mywork', 'tasks', 'flow'], [['projects', 'Projeler'], ['mywork', 'Görevlerim'], ['tasks', 'Pano'], ['flow', 'Akış']], true),
  G('clients', 'Müşteriler', '/app/crm', 'crm', ['crm', 'portal'], [['crm', 'Pipeline'], ['crm', 'Müşteriler & Markalar', '/app/crm?tab=accounts'], ['crm', 'Teklifler', '/app/crm?tab=proposals'], ['portal', 'Müşteri portalı']]),
  G('production', 'Üretim', '/app/uretim', 'studio', ['studio', 'social', 'media', 'review', 'transfer', 'present', 'marketing', 'events'],
    [['studio', 'Studio'], ['social', 'Social'], ['media', 'Media'], ['review', 'Review'], ['transfer', 'Transfer'], ['present', 'Present'], ['marketing', 'Marketing'], ['events', 'Events']]),
  G('team', 'Ekip', '/app/people', 'people', ['people', 'resources', 'twins', 'hire'], [['people', 'Kişiler'], ['resources', 'Kaynaklar'], ['twins', 'İkizler'], ['hire', 'İşe alım']]),
  G('finance', 'Finans', '/app/finance', 'finance', ['finance', 'insights'], [['finance', 'Finans'], ['insights', 'Raporlar']]),
  G('messages', 'Mesajlar', '/app/messages', 'messages', ['messages'], [], true),
  G('apps', 'Uygulamalar', '/app/apps', 'apps', ['apps'], [], true),
];
/** Modül → grup kimliği (gruba girmeyen modüller için undefined). */
export const navGroupOf = (moduleId: string): NavGroupId | undefined => NAV_GROUPS.find((g) => g.modules.includes(moduleId))?.id;
/** Üretim hub'ındaki modüller (route group `(uretim)`). */
export const PRODUCTION_MODULES = NAV_GROUPS.find((g) => g.id === 'production')!.modules;

/** Yönetim panelinden düzenlenen gezinme ayarı (organizations.settings.nav). */
export const navSettingsSchema = z.object({
  /** Grup sırası (eksik gruplar varsayılan sırada sona eklenir). */
  order: z.array(z.string()).optional(),
  /** Rol → gizlenen modül kimlikleri. */
  hidden: z.record(z.string(), z.array(z.string())).optional(),
});
export type NavSettings = z.infer<typeof navSettingsSchema>;

/**
 * Saf: rolün göreceği gruplar. `moduleVisible(id)` rol + modül anahtarı kararını verir (apps/web lib/nav.ts).
 * Tüm modülleri kapalı/gizli olan grup düşer; alt sekmeler de aynı kuralla süzülür. `nav.order` sırayı, `nav.hidden[role]` modül gizlemeyi uygular.
 */
export function visibleNavGroups(role: Role, moduleVisible: (id: string) => boolean, nav?: NavSettings | null): NavGroup[] {
  const hidden = new Set(nav?.hidden?.[role] ?? []);
  const vis = (id: string) => !hidden.has(id) && moduleVisible(id);
  const groups = NAV_GROUPS.map((g) => {
    const modules = g.modules.filter(vis);
    if (!modules.length) return null;
    const children = g.children.filter((c) => vis(c.module));
    const href = modules.includes(g.modules[0]) ? g.href : children[0]?.href ?? `/app/${modules[0]}`;
    return { ...g, modules, children, href };
  }).filter((g): g is NavGroup => !!g);
  const order = nav?.order ?? [];
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length + NAV_GROUPS.findIndex((g) => g.id === id) : i; };
  return groups.sort((a, b) => rank(a.id) - rank(b.id));
}
/** Yoldan (pathname) aktif grubu bulur: ana rota ya da alt modül rotası. */
export function activeNavGroup(path: string, groups: NavGroup[]): NavGroup | undefined {
  const p = path.split('?')[0];
  const starts = (h: string) => { const base = h.split('?')[0]; return p === base || p.startsWith(base + '/'); };
  return groups.find((g) => starts(g.href)) ?? groups.find((g) => g.children.some((c) => starts(c.href)) || g.modules.some((m) => starts(`/app/${m}`)));
}

/* ───────── Kullanıcı tercihleri (user_prefs.prefs) ───────── */
export const userPrefsSchema = z.object({
  /** Kenar çubuğu favorileri (modül kimlikleri). */
  favorites: z.array(z.string()).max(12).default([]),
  /** /app/welcome tamamlandı (ya da atlandı). */
  welcome_done: z.boolean().default(false),
  /** Bildirim tercihleri (taslak; e-posta/Slack kanalı henüz yok). */
  notifications: z.object({ in_app: z.boolean().default(true), email_digest: z.boolean().default(false), mentions: z.boolean().default(true) }).default({ in_app: true, email_digest: false, mentions: true }),
  /** Gelen kutusunda "tamam" denen öğe kimlikleri (son 300). */
  inbox_done: z.array(z.string()).max(300).default([]),
  /** Kenar çubuğu daraltılmış. */
  sidebar_collapsed: z.boolean().default(false),
});
export type UserPrefs = z.infer<typeof userPrefsSchema>;
export const DEFAULT_PREFS: UserPrefs = userPrefsSchema.parse({});
export const userPrefsPatchSchema = userPrefsSchema.partial();
/** Favori ekle/çıkar (saf, sıra korunur, en çok 12). */
export const toggleFavorite = (favs: string[], id: string): string[] => (favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id].slice(-12));
/** Gelen kutusu "tamam" kümesine ekler, 300 ile sınırlar. */
export const markInboxDone = (done: string[], id: string): string[] => (done.includes(id) ? done : [...done, id].slice(-300));

/* ───────── Kurulum sihirbazı (organizations.settings.setup) ───────── */
export const SETUP_STEPS = ['org', 'team', 'modules', 'integrations', 'first', 'summary'] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];
export const SETUP_STEP_LABELS: Record<SetupStep, string> = { org: 'Organizasyon', team: 'Ekip', modules: 'Modüller', integrations: 'Entegrasyonlar', first: 'İlk marka & proje', summary: 'Özet' };
export const setupStateSchema = z.object({
  /** Tamamlanan adımlar. */
  done: z.array(z.enum(SETUP_STEPS)).default([]),
  /** Son açık adım (devam et). */
  step: z.enum(SETUP_STEPS).optional(),
  /** Seçilen paketler (modül anahtarları buna göre yazıldı). */
  packs: z.array(z.string()).default([]),
  completed_at: z.string().nullable().default(null),
  /** Kurulumun admin'den yeniden açılma sayısı. */
  reopened: z.number().int().min(0).default(0),
});
export type SetupState = z.infer<typeof setupStateSchema>;
export const DEFAULT_SETUP: SetupState = setupStateSchema.parse({});
export const setupProgress = (s: SetupState | undefined | null) => {
  const done = new Set((s ?? DEFAULT_SETUP).done);
  const n = SETUP_STEPS.filter((x) => x !== 'summary' && done.has(x)).length;
  const total = SETUP_STEPS.length - 1;
  return { done: n, total, pct: Math.round((n / total) * 100), complete: !!(s?.completed_at) };
};
/** İlk tamamlanmamış adım (hepsi bittiyse 'summary'). */
export const nextSetupStep = (s: SetupState | undefined | null): SetupStep => SETUP_STEPS.find((x) => !(s?.done ?? []).includes(x)) ?? 'summary';
/** Kurulum kartı görünsün mü? Yalnızca owner/org_admin, tamamlanmadıysa. */
export const showSetupCard = (role: Role, s: SetupState | undefined | null) => (role === 'owner' || role === 'org_admin') && !s?.completed_at;

/** Modül paketleri: kurulum 3. adımı. Seçilen paketlerin modülleri açık, seçilmeyen paketlerin modülleri kapalı yazılır (feature_flags). */
export interface SetupPack { id: string; label: string; desc: string; modules: string[] }
export const SETUP_PACKS: SetupPack[] = [
  { id: 'agency', label: 'Ajans temel', desc: 'CRM, müşteri portalı, kaynak planı.', modules: ['crm', 'portal', 'resources'] },
  { id: 'production', label: 'Üretim', desc: 'Studio, Social, Media, Review, Transfer, Present, Marketing, Events.', modules: ['studio', 'social', 'media', 'review', 'transfer', 'present', 'marketing', 'events'] },
  { id: 'finance', label: 'Finans', desc: 'Bütçe, gider, fatura, marj ve raporlar.', modules: ['finance', 'insights'] },
  { id: 'hr', label: 'İK', desc: 'Personel kartı, özlük ve işe alım.', modules: ['people', 'hire'] },
  { id: 'ai', label: 'Yapay zekâ', desc: 'Dijital ikizler, ajan ihalesi ve AI taslakları.', modules: ['twins'] },
];
/** Paket seçiminden feature_flags farkı (saf): paket modülleri açık, diğer paket modülleri kapalı; paketsiz modüllere dokunulmaz. */
export function packsToFlags(selected: string[], current: Record<string, boolean> | undefined, flagKey: (moduleId: string) => string): Record<string, boolean> {
  const out: Record<string, boolean> = { ...(current ?? {}) };
  for (const p of SETUP_PACKS) for (const m of p.modules) out[flagKey(m)] = selected.includes(p.id);
  // AI paketi ajan özelliklerini de kapsar; modül anahtarı yeterli (feature_toggles'a dokunulmaz).
  return out;
}
/** Mevcut bayraklardan seçili paketleri türetir (bir paketin tüm modülleri açıksa seçili). */
export const packsFromFlags = (flags: Record<string, boolean> | undefined, flagKey: (moduleId: string) => string) =>
  SETUP_PACKS.filter((p) => p.modules.every((m) => flags?.[flagKey(m)] !== false)).map((p) => p.id);

/* ───────── Ekip XLSX içe aktarma (kurulum 2. adımı) ───────── */
/** "Ekip" sayfasındaki beklenen sütunlar. Yalnızca bunlar okunur. */
export const TEAM_SHEET_COLUMNS = { name: 'Ad Soyad', title: 'Pozisyon', team: 'Ekip', manager: 'Bağlı olduğu', handbook_role: 'El kitabı rolü', status: 'Statü', start: 'İşe giriş' } as const;
/** Asla okunmayan (maaş / kişisel veri) sütun kalıpları. */
export const TEAM_SHEET_IGNORED = /maaş|ücret|brüt|net|iban|tc|kimlik|doğum|adres|telefon|e-?posta|email|sgk|banka|prim|bordro/i;
export interface TeamImportRow { name: string; title: string; team: string | null; manager_name: string | null; status: 'active' | 'left'; hired_at: string | null; handbook_role: string | null; app_role?: Role }
