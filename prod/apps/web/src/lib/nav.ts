import { MODULES, canAccessModule, isAdminOnlyModule, moduleEntitled, type ModuleDef, type Role } from '@jscore/contracts';

/**
 * Sidebar'da görünecek modüller: rol erişimi + modül anahtarı (feature_flags) birlikte.
 * Yönetim modülleri (Kurul, Admin, Connect, Automation, Ürünler) Ana Yönetim Paneli'ndedir; kullanıcı menüsünde yoktur.
 */
export const navModules = (role: Role, flags: Record<string, boolean> | undefined): ModuleDef[] =>
  MODULES.filter((m) => !isAdminOnlyModule(m.id) && canAccessModule(role, m.id) && moduleEntitled(m.id, flags));

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
