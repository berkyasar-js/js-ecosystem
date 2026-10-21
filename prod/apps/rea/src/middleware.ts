import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** Oturum cookie'sini yeniler; oturum yoksa sayfaları /login'e yönlendirir (API'ler kendi 401'ini döner). */
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next(); // DEMO modu

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (data.user || req.nextUrl.pathname.startsWith('/api/')) return res;
  const u = req.nextUrl.clone();
  u.pathname = '/login';
  u.search = '';
  u.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(u);
}

export const config = { matcher: ['/((?!_next/|brand/|fonts/|favicon.svg|login|auth/).*)'] };
