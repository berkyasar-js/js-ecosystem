import { adminRoute, ok } from '@/lib/route';
import { orgSnapshot } from '@/lib/board-chat';

export const dynamic = 'force-dynamic';

/** Arayüz için proje/marka/çalışan listesi (plan uygulama formu). */
export const GET = adminRoute(async (ctx) => {
  const s = await orgSnapshot(ctx);
  return ok({ today: s.today, projects: s.projects, brands: s.brands, employees: s.employees.map(({ id, code, name, role_title }) => ({ id, code, name, role_title })) });
});
