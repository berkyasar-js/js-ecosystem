import { DEFAULT_USD_TRY } from '@jscore/core/agents/cap';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { HUB_PROVIDERS, HUB_PROVIDER_INFO } from '@jscore/ai-hub';
import { availableProviders } from '@jscore/ai-hub/server';
import { departmentQuota, hubAccess } from '@/lib/ai-hub-server';

export const dynamic = 'force-dynamic';

/** Hangi sağlayıcılar kullanılabilir, modele hangi bağlam veriliyor ve departman kotası ne durumda. */
export async function GET() {
  try {
    const repo = await getRepo();
    const { me, settings, context } = await hubAccess(repo);
    const demo = repo.mode === 'demo';
    const available = demo ? [...HUB_PROVIDERS] : availableProviders();
    const month = new Date().toISOString().slice(0, 7);
    const quota = demo ? null : await departmentQuota(repo, me, settings, context.department, month);
    return json({
      demo, context, quota, usd_try: settings.ai.usd_try ?? DEFAULT_USD_TRY,
      providers: HUB_PROVIDERS.map((id) => ({ id, label: HUB_PROVIDER_INFO[id].label, vendor: HUB_PROVIDER_INFO[id].vendor, strength: HUB_PROVIDER_INFO[id].strength, available: available.includes(id) })),
    });
  } catch (e) { return fail(e); }
}
