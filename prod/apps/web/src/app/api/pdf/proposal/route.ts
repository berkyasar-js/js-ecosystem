import { z } from 'zod';
import { proposalSchema } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { proposalPdfBytes } from '@/lib/proposal-pdf';

const body = z.object({ proposal: proposalSchema.extend({ id: z.string().optional(), org_id: z.string().optional(), created_at: z.string().optional() }), brand: z.string().max(120).default('Müşteri') });
const pdf = (bytes: Uint8Array, name: string) => new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"`, 'Cache-Control': 'no-store' } });

/** Demo'da sunucu durumsuzdur: istemci teklifi gönderir. Supabase modunda GET ?id= kayıt RLS ile okunur. */
export async function POST(req: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.me())) return json({ error: 'Oturum yok' }, 401);
    const v = body.parse(await req.json());
    return pdf(proposalPdfBytes({ id: 'x', org_id: 'x', created_at: '', ...v.proposal }, v.brand), v.proposal.number);
  } catch (e) { return fail(e); }
}
export async function GET(req: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.me())) return json({ error: 'Oturum yok' }, 401);
    const id = new URL(req.url).searchParams.get('id') ?? '';
    const p = (await repo.list('crm_proposals')).find((x) => x.id === id);
    if (!p) return json({ error: 'Teklif bulunamadı' }, 404);
    const brand = (await repo.listBrands()).find((b) => b.id === p.brand_id);
    return pdf(proposalPdfBytes(p, brand?.name ?? 'Müşteri'), p.number);
  } catch (e) { return fail(e); }
}
