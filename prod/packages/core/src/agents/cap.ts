import type { OrgSettings } from '@jscore/contracts';
import { DEMO_TODAY } from './demo';
import type { Repo } from '../repo/types';

export const DEFAULT_USD_TRY = 40;
/** Geçmiş çalıştırma yoksa tek bir ajan çağrısı için varsayılan maliyet tahmini (USD). */
export const DEFAULT_RUN_ESTIMATE_USD = 0.05;

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const fmtTry = (n: number) => `₺${nf.format(n)}`;

export interface CapStatus {
  spentUsd: number; capUsd: number; usdTry: number; spentTry: number; capTry: number;
  /** 0 → tavan yok (sınırsız). */
  unlimited: boolean; pct: number; exceeded: boolean;
}
export function capStatus(spentUsd: number, ai: OrgSettings['ai']): CapStatus {
  const usdTry = ai.usd_try ?? DEFAULT_USD_TRY;
  const capUsd = ai.monthly_cap_usd;
  const unlimited = capUsd <= 0;
  return {
    spentUsd, capUsd, usdTry, spentTry: spentUsd * usdTry, capTry: capUsd * usdTry, unlimited,
    pct: unlimited ? 0 : Math.min(100, Math.round((spentUsd / capUsd) * 100)), exceeded: !unlimited && spentUsd >= capUsd,
  };
}
export const capLabel = (s: CapStatus) => `Bu ay: ${fmtTry(s.spentTry)} / tavan ${s.unlimited ? 'yok' : fmtTry(s.capTry)}`;

export const monthOf = (iso: string) => iso.slice(0, 7);
export const sumMonth = (runs: Array<{ cost_usd: number | string; created_at: string }>, month: string) =>
  runs.filter((r) => r.created_at.startsWith(month)).reduce((a, r) => a + Number(r.cost_usd), 0);
/** Ajanın son 5 gerçek çalıştırmasının ortalaması; yoksa varsayılan. */
export function estimateRunCostUsd(agent: string, runs: Array<{ agent: string; cost_usd: number | string; status: string; created_at: string }>): number {
  const own = runs.filter((r) => r.agent === agent && r.status === 'ok').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  return own.length ? own.reduce((a, r) => a + Number(r.cost_usd), 0) / own.length : DEFAULT_RUN_ESTIMATE_USD;
}

export class CapExceededError extends Error {
  readonly status = 402;
  constructor(public cap: CapStatus) {
    super(`Aylık yapay zekâ maliyet tavanı aşılacak: bu ay ${fmtTry(cap.spentTry)} harcandı, tavan ${fmtTry(cap.capTry)}. Tavanı Admin → Yapay zekâ bölümünden yükseltebilirsin.`);
    this.name = 'CapExceededError';
  }
}

/**
 * Bir ajan çalıştırması tavanı aşacaksa CapExceededError (HTTP 402) fırlatır.
 * `spendRepo`: harcamayı okuyan repo (RLS agent_runs okumasını kısıtladığı için sunucu servis rolüyle verir).
 * `spendOverrideUsd` / `capOverrideUsd`: yalnızca demo (sunucu durumsuz; harcama ve tavan istemcinin localStorage'ındadır).
 */
export async function enforceAgentCap(args: { repo: Repo; spendRepo?: Repo; agent: string; now?: string; spendOverrideUsd?: number; capOverrideUsd?: number }): Promise<CapStatus> {
  const { repo, agent } = args;
  const reader = args.spendRepo ?? repo;
  const settings = await repo.getSettings();
  const month = monthOf(repo.mode === 'demo' ? DEMO_TODAY : (args.now ?? new Date().toISOString()));
  const spent = repo.mode === 'demo' && args.spendOverrideUsd !== undefined ? args.spendOverrideUsd : await reader.monthlyAgentSpend(month);
  const ai = repo.mode === 'demo' && args.capOverrideUsd !== undefined ? { ...settings.ai, monthly_cap_usd: args.capOverrideUsd } : settings.ai;
  const status = capStatus(spent, ai);
  if (status.unlimited) return status;
  const estimate = estimateRunCostUsd(agent, await reader.listAgentRuns().catch(() => []));
  if (status.exceeded || spent + estimate > status.capUsd) throw new CapExceededError(status);
  return status;
}
