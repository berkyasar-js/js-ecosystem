'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarCheck, Mail, Unplug } from 'lucide-react';
import { googleScopeLabel, type GoogleUserState } from '@jscore/contracts';
import { Loading, fmtTime } from '@/components/ui';
import { useSession } from '@/components/session';

/** Profil → Google (0021): kişisel takvim bağlantısı (calendar.readonly) + isteğe bağlı Gmail okuma kapsamı; token sunucuda şifreli, burada yalnızca durum. */
export function GoogleConnectPanel() {
  const { mode } = useSession();
  const qs = useSearchParams();
  const [st, setSt] = useState<GoogleUserState | null>(null);
  const [err, setErr] = useState<string | null>(qs.get('google') === 'error' ? `Google bağlantısı başarısız: ${qs.get('msg') ?? ''}` : null);
  const [note, setNote] = useState<string | null>(qs.get('google') === 'ok' ? `Bağlandı: ${qs.get('email') ?? ''}` : null);
  const [gmail, setGmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (mode === 'demo') return;
    try { const r = await fetch('/api/integrations/google', { cache: 'no-store' }); const j = (await r.json()) as GoogleUserState & { error?: string }; if (!r.ok) throw new Error(j.error); setSt(j); setGmail(j.gmail); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Durum alınamadı'); }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);
  const disconnect = async () => {
    if (!window.confirm('Google bağlantın kaldırılsın mı? Token Google’da iptal edilir; takvim etkinlikleri Ajanda’dan düşer.')) return;
    setBusy(true); setErr(null);
    try { const r = await fetch('/api/integrations/google', { method: 'DELETE' }); if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? 'Kaldırılamadı'); setNote('Bağlantı kaldırıldı.'); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(false); }
  };
  if (mode === 'demo') return <section className="card"><h2 className="font-bold">Google</h2><p className="mt-1 text-sm text-muted">Demo modu: Google Takvim bağlantısı Supabase ile gelir.</p></section>;
  if (!st && !err) return <Loading rows={3} />;
  const connectHref = `/api/integrations/google/connect?return=${encodeURIComponent('/app/profile?tab=google')}${gmail ? '&gmail=1' : ''}`;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><CalendarCheck size={16} aria-hidden /> Google Takvim</h2>
          <span className={`chip ${st?.connected ? 'chip-ok' : ''}`}>{st?.connected ? `Bağlı · ${st.email}` : 'Bağlı değil'}</span>
        </div>
        <p className="mt-1 text-sm text-muted">Takvimindeki etkinlikler (sonraki 14 gün) Ajanda’da görevlerinle yan yana, salt okunur görünür. Erişim yalnızca okuma; token sunucuda şifreli saklanır, dilediğinde kaldırabilirsin.</p>
        {err && <p role="alert" className="mt-3 text-sm text-magenta">{err}</p>}
        {note && <p role="status" className="mt-3 text-sm text-muted">{note}</p>}
        {st && !st.env_ready && <p className="mt-3 text-sm text-magenta">Google OAuth env’i tanımlı değil (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) — yöneticine haber ver.</p>}
        {st?.connected ? (
          <div className="mt-4 grid gap-3">
            <div className="flex flex-wrap gap-1.5" aria-label="Kapsamlar">{st.scopes.map((s) => <span key={s} className="chip" title={s}>{googleScopeLabel(s)}</span>)}</div>
            <p className="text-xs text-muted">Bağlandı {st.connected_at ? fmtTime(st.connected_at) : ''}</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-sm" href={connectHref}>Yeniden yetkilendir</a>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void disconnect()}><Unplug size={14} aria-hidden /> Bağlantıyı kaldır</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gmail} onChange={(e) => setGmail(e.target.checked)} /> <Mail size={14} aria-hidden /> Gmail’imi de okuma izni ver (isteğe bağlı; ileride kişisel e-posta eşlemesi için)</label>
            <a className={`btn btn-primary w-fit ${st && !st.env_ready ? 'pointer-events-none opacity-50' : ''}`} href={connectHref} aria-disabled={st ? !st.env_ready : undefined}>Google’ı bağla</a>
          </div>
        )}
      </section>
      <section className="card">
        <h2 className="font-bold">Ne görünür?</h2>
        <ul className="mt-2 grid gap-2 text-sm text-muted">
          <li>Ajanda → gün / hafta / 14 gün: etkinlik saati, başlık, konum; tıklayınca Google Takvim’de açılır.</li>
          <li>Ajans takvimi (hello@) owner tarafından panelden bağlanır; ekip “Ajans takvimi” etiketiyle görür.</li>
          <li>Hiçbir etkinlik veritabanına yazılmaz; sunucu 5 dakika önbellekler.</li>
        </ul>
      </section>
    </div>
  );
}
