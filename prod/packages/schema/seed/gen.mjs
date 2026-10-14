// Demo seed'inden CSV üretir (node --experimental-strip-types gen.mjs). Maaş/özlük verisi İÇERMEZ.
import { writeFileSync } from 'node:fs';
import { makeDemoDb, TASK_TYPES } from '../../../apps/web/src/lib/demo-seed.ts';

const db = makeDemoDb();
const csv = (rows) => rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
writeFileSync('team.csv', csv([['code', 'name', 'role_title', 'app_role', 'weekly_hours'], ...db.team.map((t) => [t.id, t.name, t.role_title, t.app_role, t.weekly_hours])]));
writeFileSync('brands.csv', csv([['code', 'name', 'sector', 'status', 'account_owner_code', 'art_director_code', 'copywriter_code', 'health', 'internal', 'monthly_quota'],
  ...db.brands.map((b) => [b.id, b.name, b.sector, b.status, b.account_owner, b.art_director, b.copywriter, b.health, b.internal, JSON.stringify(b.monthly_quota)])]));
writeFileSync('task_types.csv', csv([['key', 'label', 'sla_hours', 'default_minutes', 'unit_price_minor'], ...TASK_TYPES.map((t) => [t.key, t.label, t.sla_hours, t.default_minutes, t.unit_price_minor])]));
