import { MODULES, canAccessModule, moduleEntitled, type ModuleDef, type Role } from '@jscore/contracts';

/** Sidebar'da görünecek modüller: rol erişimi VE paket yetkisi (feature_flags) birlikte. */
export const navModules = (role: Role, flags: Record<string, boolean> | undefined): ModuleDef[] =>
  MODULES.filter((m) => canAccessModule(role, m.id) && moduleEntitled(m.id, flags));
