import { maskTrelloConfig, trelloMemberMapSchema } from '@jscore/contracts';
import { fail, json } from '@/lib/api';
import { authorizeIntegration, isResponse } from '@/lib/integrations/auth';
import { listBoards, loadTrelloConfig, memberKey, saveTrelloConfig } from '@/lib/integrations/trello';

const noStore = { 'cache-control': 'no-store' };
const res = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });

/** GET: maskeli durum (anahtar/token ASLA dönmez). `?boards=1` → Trello'dan canlı pano listesi. */
export async function GET(req: Request) {
  try {
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    const cfg = await loadTrelloConfig(a.admin, a.orgId);
    let boards: Array<{ id: string; name: string }> = [];
    if (cfg && new URL(req.url).searchParams.get('boards')) {
      try { boards = (await listBoards(cfg)).map((b) => ({ id: b.id, name: b.name })); } catch (e) { return res({ ...maskTrelloConfig(cfg), boards_error: e instanceof Error ? e.message : 'Panolar alınamadı' }); }
    }
    return res(maskTrelloConfig(cfg, boards));
  } catch (e) { return fail(e); }
}

/** PUT { board_ids?: string[], member_map?: { "<Trello adı>": "<employee id>" } } — eşlemeler sonraki içe aktarmalarda yeniden kullanılır. */
export async function PUT(req: Request) {
  try {
    const a = await authorizeIntegration(req);
    if (isResponse(a)) return a;
    const body = (await req.json().catch(() => null)) as { board_ids?: unknown; member_map?: unknown } | null;
    if (!body) return json({ error: 'JSON bekleniyor' }, 400);
    const cfg = await loadTrelloConfig(a.admin, a.orgId);
    if (!cfg) return json({ error: 'Trello bağlı değil' }, 400);
    const patch: Record<string, unknown> = {};
    if (body.board_ids !== undefined) {
      if (!Array.isArray(body.board_ids) || body.board_ids.some((x) => typeof x !== 'string')) return json({ error: 'board_ids string[] olmalı' }, 400);
      patch.board_ids = body.board_ids;
    }
    if (body.member_map !== undefined) {
      const { member_map } = trelloMemberMapSchema.parse({ member_map: body.member_map });
      const { data } = await a.admin.from('employees').select('id').eq('org_id', a.orgId);
      const ok = new Set((data ?? []).map((r: { id: string }) => r.id));
      const next = { ...(cfg.member_map ?? {}) };
      for (const [name, emp] of Object.entries(member_map)) {
        if (!ok.has(emp)) return json({ error: `Geçersiz çalışan: ${emp}` }, 400);
        const k = memberKey(name);
        if (k) next[k] = emp;
      }
      patch.member_map = next;
    }
    return res(maskTrelloConfig(await saveTrelloConfig(a.admin, a.orgId, patch)));
  } catch (e) { return fail(e); }
}
