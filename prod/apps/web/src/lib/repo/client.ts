'use client';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured } from '../env';
import { createBrowser } from '../supabase/browser';
import { DemoRepo } from './demo';
import { SupabaseRepo } from './supabase';
import type { Repo } from './types';

export const readCookie = (name: string) =>
  typeof document === 'undefined' ? undefined : document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1];
export const setCookie = (name: string, value: string) => { document.cookie = `${name}=${value}; path=/; max-age=2592000; samesite=lax`; };
export const clearCookie = (name: string) => { document.cookie = `${name}=; path=/; max-age=0`; };

/** Tarayıcı tarafı repo. Demo'da localStorage kalıcılığı kullanır. */
export function createClientRepo(orgId?: string | null): Repo {
  if (isSupabaseConfigured()) return new SupabaseRepo(createBrowser(), orgId ?? readCookie(ORG_COOKIE) ?? null);
  return new DemoRepo({ accountId: readCookie(DEMO_COOKIE), orgId: orgId ?? readCookie(ORG_COOKIE), storage: window.localStorage });
}
