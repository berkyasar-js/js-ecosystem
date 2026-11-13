import { MODULES, NAV_GROUPS, activeNavGroup, canAccessModule, isAdminOnlyModule, moduleEntitled, visibleNavGroups, type ModuleDef, type NavGroup, type NavSettings, type Role } from '@jscore/contracts';

/**
 * Sidebar'da görünecek modüller: rol erişimi + modül anahtarı (feature_flags) birlikte.
 * Yönetim modülleri (Kurul, Admin, Connect, Automation, Ürünler) Ana Yönetim Paneli'ndedir; kullanıcı menüsünde yoktur.
 */
export const navModules = (role: Role, flags: Record<string, boolean> | undefined): ModuleDef[] =>
  MODULES.filter((m) => !isAdminOnlyModule(m.id) && canAccessModule(role, m.id) && moduleEntitled(m.id, flags));

/** Modül görünür mü? (rol + anahtar; yönetim modülleri hariç) */
export const moduleVisible = (role: Role, flags: Record<string, boolean> | undefined) => (id: string) => {
  const m = MODULES.find((x) => x.id === id);
  return !!m && !isAdminOnlyModule(m.id) && canAccessModule(role, m.id) && moduleEntitled(m.id, flags);
};

/** Gruplu gezinme: rol + bayrak + yönetim panelindeki `settings.nav` düzeni. Tüm modülleri kapalı grup düşer. */
export const navGroups = (role: Role, flags: Record<string, boolean> | undefined, nav?: NavSettings | null): NavGroup[] =>
  visibleNavGroups(role, moduleVisible(role, flags), nav);

/** Gruplara girmeyen ama role açık modüller (ör. profil) — Uygulamalar'da görünür, kenar çubuğunda değil. */
export const ungroupedModules = (role: Role, flags: Record<string, boolean> | undefined): ModuleDef[] =>
  navModules(role, flags).filter((m) => !NAV_GROUPS.some((g) => g.modules.includes(m.id)) && m.id !== 'profile' && m.id !== 'apps');

/** Mobil alt sekmeler: `mobile` işaretli görünür gruplar (en çok 5). */
export const mobileTabs = (groups: NavGroup[]): NavGroup[] => groups.filter((g) => g.mobile).slice(0, 5);

/** Ekmek kırıntısı: aktif grup + (varsa) alt sekme etiketi. */
export function crumbFor(path: string, groups: NavGroup[], fallback = 'Ana Sayfa'): { group: string; sub?: string } {
  const g = activeNavGroup(path, groups);
  if (!g) return { group: path.startsWith('/app/profile') ? 'Profil' : path.startsWith('/app/setup') ? 'Kurulum' : path.startsWith('/app/welcome') ? 'Hoş geldin' : fallback };
  const p = path.split('?')[0];
  const sub = g.children.find((c) => { const b = c.href.split('?')[0]; return b !== g.href.split('?')[0] && (p === b || p.startsWith(b + '/')); });
  return { group: g.label, sub: sub?.label };
}

/** Bir `/app/<slug>` yolunun modülü (yoksa null). */
export const moduleOfPath = (path: string): ModuleDef | null => {
  const slug = path.split('?')[0].split('/')[2];
  return slug ? MODULES.find((m) => m.slug === slug) ?? null : null;
};

export type RouteVerdict = 'ok' | 'moved' | 'disabled';
/** Rota kararı: yönetim modülü → 'moved' (bildirim sayfası kendi başına gösterilir), kapalı modül → 'disabled' (genel bakışa yönlenir). */
export function routeVerdict(path: string, flags: Record<string, boolean> | undefined): RouteVerdict {
  const m = moduleOfPath(path);
  if (!m) return 'ok';
  if (isAdminOnlyModule(m.id)) return 'moved';
  return moduleEntitled(m.id, flags) ? 'ok' : 'disabled';
}
