import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** /admin/* sayfaları: oturum yoksa /login. Rol kontrolü sunucu layout'unda (servis rolüyle) yapılır; API rotaları kendi korumasını uygular. */
export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const toLogin = () => {
    const u = req.nextUrl.clone();
    u.pathname = '/login'; u.search = '';
    u.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(u);
  };
  if (!url || !anon) return req.cookies.get('jsdemo_account') ? NextResponse.next() : toLogin();
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
  return data.user ? res : toLogin();
}
export const config = { matcher: ['/admin/:path*'] };
