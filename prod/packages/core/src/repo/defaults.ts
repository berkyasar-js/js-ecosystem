import type { OrgSettings } from '@jscore/contracts';

export const DEFAULT_SETTINGS: OrgSettings = {
  general: { name: 'Organizasyon', locale: 'tr-TR', timezone: 'Europe/Istanbul', currency: 'TRY' },
  notifications: { rules: [{ event: 'approval.created', channel: 'in_app', enabled: true }, { event: 'task.overdue', channel: 'in_app', enabled: true }] },
  structure: { flow_stages: ['brief', 'scope', 'plan', 'production', 'internal_review', 'approval', 'delivery', 'archive'], work_hours: '09:00-18:00' },
  ai: { monthly_cap_usd: 50, default_model: 'claude-sonnet-4-5', board_enabled: false },
  security: { mfa_required: true, session_hours: 12, ip_allowlist: [] },
};
