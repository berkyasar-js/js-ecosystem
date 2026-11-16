/* ───────── Roller (yaprak modül: döngüsel içe aktarma olmadan governance/modules buradan okur) ───────── */
export const ROLES = [
  'owner', 'org_admin', 'operations', 'account', 'pm', 'creative', 'hr', 'payroll',
  'finance', 'client_admin', 'client_viewer', 'freelancer', 'auditor', 'integration_admin',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner', org_admin: 'Org Admin', operations: 'Operasyon', account: 'Account', pm: 'PM',
  creative: 'Creative', hr: 'İK', payroll: 'Bordro', finance: 'Finans', client_admin: 'Client Admin',
  client_viewer: 'Client Viewer', freelancer: 'Freelancer', auditor: 'Denetçi', integration_admin: 'Entegrasyon Admin',
};
export const isClientRole = (r: Role) => r === 'client_admin' || r === 'client_viewer';

/** Onay kararı: kim hangi required_role'ü karara bağlayabilir. */
export function canDecideApproval(role: Role, required: Role): boolean {
  if (role === 'owner') return true;
  if (role === 'org_admin') return required !== 'owner';
  if (role === required) return true;
  if (required === 'pm') return role === 'operations' || role === 'account';
  if (required === 'account') return role === 'operations';
  return false;
}
