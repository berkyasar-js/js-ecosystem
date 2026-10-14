import type { Repo } from '../repo/types';
import { monthOf } from './cap';

/**
 * İstemciden /api/agents/run çağrısı: demo'da sunucu durumsuz olduğundan ay içi harcama ve tavan, istemcinin deposundan gövdeye eklenir
 * (Supabase'de sunucu kendisi okur; bu alanlar yok sayılır). `today` = todayFor(mode).
 */
export async function agentRunBody(repo: Repo | null, today: string, body: { agent: string; input: Record<string, unknown> }) {
  if (!repo || repo.mode !== 'demo') return body;
  const [spent, settings] = await Promise.all([repo.monthlyAgentSpend(monthOf(today)), repo.getSettings()]);
  return { ...body, demo_spend_usd: spent, demo_cap_usd: settings.ai.monthly_cap_usd };
}
