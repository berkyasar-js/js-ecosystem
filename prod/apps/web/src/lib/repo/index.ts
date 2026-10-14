import { cookies } from 'next/headers';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured } from '../env';
import { createServer } from '../supabase/server';
import { DemoRepo } from './demo';
import { SupabaseRepo } from './supabase';
import type { Repo } from './types';

export type { Repo } from './types';

/** Sunucu tarafı: Supabase env varsa RLS'li SupabaseRepo, yoksa DemoRepo (cookie'den hesap/org; kalıcılık yok). */
export async function getRepo(): Promise<Repo> {
  const store = await cookies();
  const orgId = store.get(ORG_COOKIE)?.value;
  if (isSupabaseConfigured()) return new SupabaseRepo(await createServer(), orgId ?? null);
  return new DemoRepo({ accountId: store.get(DEMO_COOKIE)?.value, orgId });
}
