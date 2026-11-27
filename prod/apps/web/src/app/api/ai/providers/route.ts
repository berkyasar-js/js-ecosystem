import { isClientRole } from '@jscore/contracts';
import { fail, json } from '@jscore/core/api';
import { getRepo } from '@jscore/core/repo';
import { ForbiddenError } from '@jscore/core/repo/types';
import { HUB_PROVIDERS, HUB_PROVIDER_INFO } from '@jscore/ai-hub';
import { availableProviders } from '@jscore/ai-hub/server';

export const dynamic = 'force-dynamic';

/** Ajan çalıştırırken seçilebilecek sağlayıcılar (Claude / ChatGPT / Gemini) ve hangilerinin anahtarı tanımlı. Anahtar değeri hiçbir zaman dönmez. */
export async function GET() {
  try {
    const repo = await getRepo();
    const me = await repo.me();
    if (!me || isClientRole(me.role)) throw new ForbiddenError('Oturum yok');
    const available = repo.mode === 'demo' ? [...HUB_PROVIDERS] : availableProviders();
    return json({ demo: repo.mode === 'demo', providers: HUB_PROVIDERS.map((id) => ({ id, label: HUB_PROVIDER_INFO[id].label, strength: HUB_PROVIDER_INFO[id].strength, available: available.includes(id) })) });
  } catch (e) { return fail(e); }
}
