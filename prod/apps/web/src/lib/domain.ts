import { type Allocation, type Candidate, type Checklist, type Contract, type HrProfile, type Leave, type Offer, type Proposal, type QuoteLine, type SurveyResponse, type TeamMember, type Task } from '@jscore/contracts';

/* ───────── Tarih yardımcıları (UTC, gün bazlı) ───────── */
const D = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
export const addDays = (iso: string, n: number) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (iso: string) => { const d = D(iso); const dow = (d.getUTCDay() + 6) % 7; return addDays(iso, -dow); };
export const weeksFrom = (iso: string, n = 6) => Array.from({ length: n }, (_, i) => addDays(mondayOf(iso), i * 7));
/** [a,b] aralığının hafta içi günlerinden kaçı [week, week+4] içine düşer. */
export function weekdaysOverlap(start: string, end: string, weekStart: string): number {
  let n = 0;
  for (let i = 0; i < 5; i++) { const day = addDays(weekStart, i); if (day >= start && day <= end) n++; }
  return n;
}

/* ───────── Teklif ───────── */
export function proposalTotals(lines: QuoteLine[], vatPct: number) {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.unit_minor), 0);
  const vat = Math.round((subtotal * vatPct) / 100);
  return { subtotal, vat, total: subtotal + vat };
}
export const dueDateFor = (issued: string, termsDays: number) => addDays(issued, termsDays);
/** Yeni sürüm: sürüm numarası artar, geçmişe önceki toplam eklenir. */
export function bumpProposal(p: Proposal, at: string): Pick<Proposal, 'version' | 'history' | 'status'> {
  const t = proposalTotals(p.lines, p.vat_pct).total;
  return { version: p.version + 1, status: 'draft', history: [...p.history, { version: p.version + 1, total_minor: t, at }] };
}

/* ───────── Sözleşme kotası ───────── */
export interface ContractUsage { key: string; limit: number; used: number; pct: number; over: boolean }
export function contractUsage(c: Pick<Contract, 'inclusions' | 'revision_limit' | 'revisions_used'>, used: Record<string, number>): { rights: ContractUsage[]; revision: ContractUsage } {
  const rights = Object.entries(c.inclusions).map(([key, limit]) => {
    const u = used[key] ?? 0;
    return { key, limit, used: u, pct: limit ? Math.round((u / limit) * 100) : 0, over: u > limit };
  });
  const rev = c.revisions_used;
  return { rights, revision: { key: 'revision', limit: c.revision_limit, used: rev, pct: c.revision_limit ? Math.round((rev / c.revision_limit) * 100) : 0, over: rev > c.revision_limit } };
}

/* ───────── Marj: saat × maliyet + direkt gider (maaş değil; birleşik saatlik maliyet) ───────── */
export interface MarginInput { revenue_minor: number; hours: Array<{ hours: number; hourly_cost_minor: number }>; direct_expense_minor: number }
export function marginFormula(i: MarginInput) {
  const labor = Math.round(i.hours.reduce((s, h) => s + h.hours * h.hourly_cost_minor, 0));
  const cost = labor + i.direct_expense_minor;
  const margin = i.revenue_minor - cost;
  return { labor_minor: labor, direct_minor: i.direct_expense_minor, cost_minor: cost, margin_minor: margin, margin_pct: i.revenue_minor > 0 ? Math.round((margin / i.revenue_minor) * 1000) / 10 : 0 };
}
export const MARGIN_EXPLAIN = 'Marj = Gelir − (Σ saat × saatlik maliyet + direkt gider). Saatlik maliyet kişi bazında gösterilmez; yalnızca proje düzeyinde toplam maliyet raporlanır. Maaş verisi bu hesaba girmez.';

/* ───────── Kapasite (izin onayı kapasiteyi düşürür) ───────── */
export function weeklyCapacity(m: Pick<TeamMember, 'id' | 'weekly_hours'>, week: string, allocations: Allocation[], leaves: Leave[]) {
  const perDay = m.weekly_hours / 5;
  const leaveDays = leaves.filter((l) => l.employee_id === m.id && l.status === 'approved').reduce((s, l) => s + weekdaysOverlap(l.start, l.end, week), 0);
  const capacity = Math.max(0, Math.round((m.weekly_hours - leaveDays * perDay) * 10) / 10);
  const allocated = allocations.filter((a) => a.employee_id === m.id && a.week === week).reduce((s, a) => s + a.hours, 0);
  return { capacity, allocated, load_pct: capacity > 0 ? Math.round((allocated / capacity) * 100) : allocated > 0 ? 999 : 0, leave_days: leaveDays, over40: allocated > 40 };
}

/* ───────── Anket eşiği ───────── */
export function surveyStats(kind: 'csat' | 'nps', responses: Pick<SurveyResponse, 'score'>[]) {
  const n = responses.length;
  if (!n) return { n, value: 0 };
  if (kind === 'csat') return { n, value: Math.round((responses.reduce((s, r) => s + r.score, 0) / n) * 10) / 10 };
  const pro = responses.filter((r) => r.score >= 9).length;
  const det = responses.filter((r) => r.score <= 6).length;
  return { n, value: Math.round(((pro - det) / n) * 100) };
}
/** CSAT: ortalama < eşik (varsayılan 4) veya NPS < eşik (varsayılan 0) → müşteri riskli, kurucuya/hesaba uyarı. */
export const surveyBelowThreshold = (kind: 'csat' | 'nps', responses: Pick<SurveyResponse, 'score'>[], threshold: number) => responses.length > 0 && surveyStats(kind, responses).value < threshold;

/* ───────── Teklif → çalışan ───────── */
export function offerToEmployee(cand: Pick<Candidate, 'id' | 'name' | 'email'>, offer: Pick<Offer, 'role_title' | 'app_role' | 'start_date'>, team: Pick<TeamMember, 'id'>[]) {
  const initials = cand.name.split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 3);
  let code = initials; let n = 2;
  while (team.some((t) => t.id === code)) code = `${initials.slice(0, 2)}${n++}`;
  const member = { id: code, name: cand.name, role_title: offer.role_title, app_role: offer.app_role, status: 'active' as const, weekly_hours: 40 };
  const profile: Omit<HrProfile, 'id' | 'org_id' | 'created_at'> = { employee_id: code, dept: 'Kreatif', manager: 'BY', start_date: offer.start_date, end_date: null, status: 'active', employment: 'full', phone: '', email: cand.email, leave_total: 14 };
  const tasks: Array<Omit<Checklist, 'id' | 'org_id' | 'created_at'>> = ['Sözleşme ve özlük evraklarını topla', 'Zimmet hazırla (dizüstü, hesaplar)', 'Erişimleri aç (Google, Slack, JS Ecosystem)', 'İlk hafta orientation planı', 'İlk görev: mevcut projeyi incele ve sunum yap']
    .map((title, i) => ({ employee_id: code, flow: 'onboarding' as const, title, done: false, due: addDays(offer.start_date, i === 4 ? 5 : i), owner: i === 4 ? 'UC' : 'BA' }));
  return { member, profile, tasks };
}

/* ───────── CSV ───────── */
export function toCsv(rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const cell = (v: string | number | boolean | null | undefined) => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function downloadCsv(name: string, rows: Array<Array<string | number | boolean | null | undefined>>) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ───────── Sağlık skoru (Account 360) ───────── */
export function accountHealth(base: number, opts: { overdueTasks: number; overdueInvoices: number; csat?: number }) {
  let h = base - opts.overdueTasks * 4 - opts.overdueInvoices * 6;
  if (opts.csat !== undefined && opts.csat > 0) h += Math.round((opts.csat - 4) * 5);
  return Math.max(0, Math.min(100, h));
}
export const openTasks = (tasks: Task[]) => tasks.filter((t) => t.state !== 'archive');
export const fmtTimecode = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const parseTimecode = (t: string) => { const [m, s] = t.split(':').map(Number); return (m || 0) * 60 + (s || 0); };
