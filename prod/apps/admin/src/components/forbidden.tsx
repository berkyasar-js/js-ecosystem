'use client';
import { createBrowser } from '@jscore/core/supabase/browser';
import { clearCookie } from '@jscore/core/repo/client';
import { DEMO_COOKIE, ORG_COOKIE, isSupabaseConfigured } from '@jscore/core/env';

const WHY: Record<string, string> = {
  forbidden: 'Bu panel yalnızca owner ve org admin rolleri içindir.',
  no_membership: 'Hiçbir organizasyonda üyeliğin yok.',
  disabled: 'Üyeliğin devre dışı bırakılmış.',
  no_session: 'Oturum bulunamadı.',
};
export function Forbidden({ reason, appUrl }: { reason: string; appUrl: string }) {
  const out = async () => {
    if (isSupabaseConfigured()) await createBrowser().auth.signOut();
    clearCookie(DEMO_COOKIE); clearCookie(ORG_COOKIE);
    location.href = '/login';
  };
  return (
    <main className="login" id="main">
      <div className="login-card">
        <img className="logo" src="/brand/jobs-logo-light.svg" alt="Jobs Studio" width={180} height={35} />
        <div className="eyebrow">ANA YÖNETİM PANELİ</div>
        <h1>Yetkiniz yok</h1>
        <p className="lead">{WHY[reason] ?? WHY.forbidden}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {appUrl && <a className="btn btn-primary" href={`${appUrl}/app/overview`}>Kullanıcı uygulamasına git</a>}
          <button className="btn" onClick={out}>Çıkış yap</button>
        </div>
      </div>
    </main>
  );
}
