import type { SupabaseClient } from '@supabase/supabase-js';
import { TrelloApiError, SupabaseTrelloStore, fetchSnapshot, listBoards, loadTrelloConfig, saveTrelloConfig, trelloFetch, writeSyncLog } from './trello';
import { buildListMap, buildMemberIds, reconcilePlan, runImport, type SyncLogDraft, type TrelloCard } from './trello-map';
import { pushTaskNow } from './trello-push';

export interface ReconcileSummary {
  org_id: string; skipped?: 'off' | 'not_connected'; pulled: number; pushed: number; created_cards: number; archived: number; vanished: number; skipped_conflicts: number; errors: string[];
}
const CAP = { push: 150, missing: 40, unlinked: 60 };

/**
 * Saatlik tam uzlaştırma (mode ≠ off):
 *  1) pano anlık görüntüsü + tersinir liste/üye eşlemelerini tazele,
 *  2) (iki yönlü) last_sync_at'ten beri JS'te değişen görevleri ve kartsız Trello-proje görevlerini Trello'ya it,
 *  3) last_sync_at'ten beri değişen (ya da görevi olmayan) kartları içe aktar — çakışmada son yazan kazanır,
 *  4) Trello'da silinen/arşivlenen kartların görevlerini arşive al; kartı başka yere gitmiş görevleri günlüğe yaz.
 */
export async function reconcileTrello(admin: SupabaseClient, orgId: string): Promise<ReconcileSummary> {
  const out: ReconcileSummary = { org_id: orgId, pulled: 0, pushed: 0, created_cards: 0, archived: 0, vanished: 0, skipped_conflicts: 0, errors: [] };
  let cfg = await loadTrelloConfig(admin, orgId);
  if (!cfg) return { ...out, skipped: 'not_connected' };
  if (cfg.mode === 'off') return { ...out, skipped: 'off' };
  const creds = { api_key: cfg.api_key, token: cfg.token };
  const now = new Date().toISOString();
  const since = cfg.last_sync_at ?? null;
  const logs: SyncLogDraft[] = [];
  const store = new SupabaseTrelloStore(admin, orgId);

  let boards = await listBoards(creds);
  if (cfg.board_ids?.length) boards = boards.filter((b) => cfg!.board_ids!.includes(b.id));
  const snap = await fetchSnapshot(creds, boards.map((b) => ({ id: b.id, name: b.name })));
  const st = await store.load();
  cfg = await saveTrelloConfig(admin, orgId, {
    list_map: buildListMap(snap.lists, st.employees, cfg.member_map), member_ids: buildMemberIds(snap.members, st.employees, cfg.member_map),
  });

  // Kartsız yeni görevler (Trello kaynaklı projelerde)
  const trelloProjects = st.projects.filter((p) => p.source_ref?.startsWith('trello:board:')).map((p) => p.id);
  let unlinkedTasks: Array<{ id: string }> = [];
  if (cfg.mode === 'two_way' && trelloProjects.length) {
    const { data } = await admin.from('tasks').select('id').eq('org_id', orgId).is('source_ref', null).neq('state', 'archive').in('project_id', trelloProjects).limit(CAP.unlinked);
    unlinkedTasks = (data ?? []) as typeof unlinkedTasks;
  }
  const plan = reconcilePlan(snap.cards, st.tasks, since, { trelloProjectIds: new Set(trelloProjects) });

  if (cfg.mode === 'two_way') {
    for (const t of plan.pushTasks.slice(0, CAP.push)) {
      const r = await pushTaskNow(admin, orgId, t.id, cfg);
      if (r === 'updated') out.pushed++; else if (r === 'skipped') out.skipped_conflicts++; else if (r === 'error') out.errors.push(`itme: ${t.id}`);
    }
    for (const t of unlinkedTasks) if ((await pushTaskNow(admin, orgId, t.id, cfg)) === 'created') out.created_cards++;
  }

  const imp = await runImport({ ...snap, cards: plan.pullCards }, store, { now, memberMap: cfg.member_map, onLog: (e) => logs.push({ ...e, direction: 'reconcile' }) });
  out.pulled = imp.tasks_created + imp.tasks_updated;
  out.skipped_conflicts += imp.tasks_skipped ?? 0;
  out.errors.push(...imp.errors);

  for (const t of plan.missing.slice(0, CAP.missing)) {
    const cardId = t.source_ref.slice(7);
    try {
      let card: Pick<TrelloCard, 'closed'> | null;
      try { card = await trelloFetch<TrelloCard>(creds, `/cards/${cardId}`, { params: { fields: 'closed,idBoard' } }); }
      catch (e) { if (e instanceof TrelloApiError && e.status === 404) card = null; else throw e; }
      if (!card || card.closed) {
        await store.updateTask(t.id, { state: 'archive' });
        out.archived++;
        logs.push({ direction: 'reconcile', entity: 'task', entity_id: t.id, external_id: cardId, action: 'archived', ok: true, message: card ? 'Kart Trello’da arşivlendi' : 'Kart Trello’da silindi' });
      } else {
        await store.updateTask(t.id, { labels: [...t.labels, 'trello:vanished'] });
        out.vanished++;
        logs.push({ direction: 'reconcile', entity: 'task', entity_id: t.id, external_id: cardId, action: 'vanished', ok: false, message: 'Kart seçili panolarda yok (taşınmış olabilir); görev korundu' });
      }
    } catch (e) { out.errors.push(`${cardId}: ${e instanceof Error ? e.message : String(e)}`); }
  }

  logs.push({ direction: 'reconcile', entity: 'integration', entity_id: null, external_id: null, action: 'reconcile', ok: out.errors.length === 0, message: `çekilen ${out.pulled} · itilen ${out.pushed} · yeni kart ${out.created_cards} · arşiv ${out.archived} · kayıp ${out.vanished} · atlanan ${out.skipped_conflicts}${out.errors.length ? ` · hata ${out.errors.length}` : ''}` });
  await writeSyncLog(admin, orgId, logs);
  await saveTrelloConfig(admin, orgId, { last_sync_at: now });
  return out;
}
