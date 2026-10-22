import { NextResponse } from 'next/server';
import { createAdmin } from '@jscore/core/supabase/admin';
import { createServer } from '@jscore/core/supabase/server';
import { loginDomainAllowed } from '@/lib/auth-domain';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app/overview';
  if (code) {
    const sb = await createServer();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      // Ana Yönetim Paneli → Güvenlik → izinli e-posta alan adları: yalnızca Google girişinde uygulanır.
      const user = data.user;
      const latest = [...(user?.identities ?? [])].sort((a, b) => (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? ''))[0];
      if (user && latest?.provider === 'google' && !(await loginDomainAllowed(createAdmin(), user.id, user.email))) {
        await sb.auth.signOut();
        return NextResponse.redirect(new URL('/login?error=domain', url.origin));
      }
      return NextResponse.redirect(new URL(safe, url.origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=auth', url.origin));
}
