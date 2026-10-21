import { NextResponse } from 'next/server';
import { createServer } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/projeler';
  if (code) {
    const sb = await createServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=auth', url.origin));
}
