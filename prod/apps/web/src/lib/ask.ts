import type { Approval, Brand, Project, Task, TeamMember } from '@jscore/contracts';
import { byDue, isDone, isOverdue } from '@/components/work/work-utils';
import { teamPulse } from './home';

/** Ctrl+J "Sor": yerel veriden kurallı yanıt (LLM yok). Owner için Kurul Sohbeti bağlantısı arayüzde ayrıca verilir. */
export interface AskContext { tasks: Task[]; projects: Project[]; brands: Brand[]; team: TeamMember[]; approvals: Approval[]; today: string; employeeId?: string }
export interface AskAnswer { title: string; lines: string[]; href?: string; intent: AskIntent }
export type AskIntent = 'due_today' | 'overdue' | 'overloaded' | 'approvals' | 'project' | 'person' | 'brand' | 'summary' | 'help';

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[’'"]/g, '');
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

/** Soru → niyet (saf, testli). */
export function detectIntent(question: string): AskIntent {
  const q = norm(question);
  if (!q.trim() || has(q, 'yardım', 'ne sorabilirim', 'help')) return 'help';
  if (has(q, 'gecik', 'overdue', 'kaçır')) return 'overdue';
  if (has(q, 'bugün', 'today', 'teslim')) return 'due_today';
  if (has(q, 'yoğun', 'yük', 'kapasite', 'overload', 'dolu', 'kim boş', 'müsait')) return 'overloaded';
  if (has(q, 'onay', 'approval', 'karar')) return 'approvals';
  if (has(q, 'proje', 'project')) return 'project';
  if (has(q, 'marka', 'müşteri', 'brand')) return 'brand';
  if (has(q, 'kim', 'kişi', 'ekip')) return 'person';
  return 'summary';
}

const list = (tasks: Task[], nameOf: (id: string | null) => string, n = 6) => tasks.slice(0, n).map((t) => `• ${t.title} — ${nameOf(t.assignee_id)}${t.due_at ? ` · ${t.due_at.slice(0, 10)}` : ''}`);

/** Yerel yanıt üretir; eşleşen ad/proje/marka varsa ona odaklanır. */
export function answerLocally(question: string, c: AskContext): AskAnswer {
  const q = norm(question);
  const nameOf = (id: string | null) => (id ? c.team.find((m) => m.id === id)?.name ?? id : 'Atanmamış');
  const open = c.tasks.filter((t) => !isDone(t)).sort(byDue);
  const intent = detectIntent(question);
  const person = c.team.find((m) => q.includes(norm(m.name.split(/\s+/)[0])) && m.name.length > 2);
  const project = c.projects.find((p) => q.includes(norm(p.name)));
  const brand = c.brands.find((b) => q.includes(norm(b.name)));
  if (project || (intent === 'project' && !person && !brand)) {
    const p = project ?? c.projects.find((x) => x.status === 'active');
    if (!p) return { intent: 'project', title: 'Proje bulunamadı', lines: ['Adını yazarak sor: "Anova lansman projesi ne durumda?"'] };
    const ts = c.tasks.filter((t) => t.project_id === p.id); const done = ts.filter(isDone).length; const late = ts.filter((t) => !isDone(t) && isOverdue(t, c.today));
    return { intent: 'project', title: p.name, href: `/app/projects/${p.id}`, lines: [`${ts.length} görev · ${done} tamamlandı · ${late.length} gecikmiş · aşama: ${p.flow_stage}`, ...(p.due_at ? [`Teslim: ${p.due_at.slice(0, 10)}`] : []), ...list(late.length ? late : ts.filter((t) => !isDone(t)), nameOf, 4)] };
  }
  if (brand) {
    const ps = c.projects.filter((p) => p.brand_id === brand.id); const ids = new Set(ps.map((p) => p.id)); const ts = open.filter((t) => ids.has(t.project_id));
    return { intent: 'brand', title: brand.name, href: `/app/crm/${brand.id}`, lines: [`Sağlık ${brand.health} · ${ps.length} proje · ${ts.length} açık görev · ${ts.filter((t) => isOverdue(t, c.today)).length} gecikmiş`, ...list(ts, nameOf, 4)] };
  }
  if (person) {
    const ts = open.filter((t) => t.assignee_id === person.id); const pulse = teamPulse(c.tasks, [person], c.today)[0];
    return { intent: 'person', title: person.name, href: '/app/people', lines: [`${ts.length} açık görev · ${ts.filter((t) => isOverdue(t, c.today)).length} gecikmiş · yük %${pulse?.loadPct ?? 0}`, ...list(ts, nameOf, 5)] };
  }
  switch (intent) {
    case 'due_today': { const ts = open.filter((t) => t.due_at?.slice(0, 10) === c.today && (!c.employeeId || t.assignee_id === c.employeeId || !q.includes('benim'))); return { intent, title: `Bugün teslim: ${ts.length}`, href: '/app/mywork', lines: ts.length ? list(ts, nameOf) : ['Bugün teslim görev yok.'] }; }
    case 'overdue': { const ts = open.filter((t) => isOverdue(t, c.today)); return { intent, title: `Geciken: ${ts.length}`, href: '/app/tasks', lines: ts.length ? list(ts, nameOf) : ['Geciken görev yok.'] }; }
    case 'overloaded': { const rows = teamPulse(c.tasks, c.team, c.today); const hot = rows.filter((r) => r.loadPct >= 85 || r.overdue > 0); return { intent, title: hot.length ? `Yükü yüksek: ${hot.length} kişi` : 'Ekip dengede', href: '/app/resources', lines: (hot.length ? hot : rows).slice(0, 6).map((r) => `• ${r.member.name} — ${r.open} açık, ${r.overdue} gecikmiş, yük %${r.loadPct}`) }; }
    case 'approvals': { const ps = c.approvals.filter((a) => a.status === 'pending'); return { intent, title: `Bekleyen onay: ${ps.length}`, href: '/app/approvals', lines: ps.slice(0, 6).map((a) => `• ${a.title} · ${a.required_role} · ${a.due_at.slice(0, 10)}`) }; }
    case 'help': return { intent, title: 'Şunları sorabilirsin', lines: ['• Bugün ne teslim?', '• Neler gecikti?', '• Kim yoğun?', '• Bekleyen onaylar', '• <Proje adı> ne durumda?', '• <Kişi adı> neler yapıyor?'] };
    default: { const late = open.filter((t) => isOverdue(t, c.today)); return { intent: 'summary', title: 'Özet', href: '/app/overview', lines: [`${open.length} açık görev · ${late.length} gecikmiş · ${c.approvals.filter((a) => a.status === 'pending').length} bekleyen onay · ${c.projects.filter((p) => p.status === 'active').length} aktif proje`, 'Daha özel sormak için proje, marka ya da kişi adı yaz.'] }; }
  }
}
