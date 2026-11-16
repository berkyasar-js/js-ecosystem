'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bell, BellOff, Check, CheckCheck, ExternalLink, Settings2, X } from 'lucide-react';
import { groupByDay, kindPref, normalizeKind, notificationKindLabel, type Notification } from '@jscore/contracts';
import { useSession } from './session';

/**
 * Bildirim merkezi (0019): son 50 bildirimim (Repo `listNotifications`), canlı ekler (`subscribeNotifications`: Supabase Realtime / demo yayın),
 * sağ altta en çok 3 toast (8 sn), isteğe bağlı tarayıcı bildirimi (Profil → Bildirimler'den izin; otomatik istenmez) ve ses (varsayılan kapalı).
 * Tercih: prefs.notifications.channels.inapp / kinds[k].inapp kapalıysa o tür toast / rozet / tarayıcı bildirimi üretmez (merkezde sönük listelenir).
 */
interface Ctx {
  items: Notification[]; unread: number; loading: boolean;
  markRead(ids: string[]): Promise<void>; markAllRead(): Promise<void>; refresh(): void;
  /** Tür uygulama içi kanalda açık mı? */
  visible(n: Pick<Notification, 'kind'>): boolean;
}
const NotifCtx = createContext<Ctx | null>(null);
export const useNotifications = () => { const c = useContext(NotifCtx); if (!c) throw new Error('NotificationsProvider yok'); return c; };

interface ToastItem { id: string; n: Notification; until: number }
const TOAST_MS = 8000;
const MAX_TOASTS = 3;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { repo, me, rev, prefs, prefsLoaded } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [live, setLive] = useState('');
  const np = prefs.notifications;
  const visible = useCallback((n: Pick<Notification, 'kind'>) => np.channels.inapp && kindPref(np, normalizeKind(n.kind)).inapp, [np]);
  const seen = useRef(new Set<string>());

  const refresh = useCallback(() => {
    if (!repo || !me) return;
    repo.listNotifications({ mine: true, limit: 50 }).then((rows) => { setItems(rows); rows.forEach((r) => seen.current.add(r.id)); setLoading(false); }, () => setLoading(false));
  }, [repo, me]);
  useEffect(() => { refresh(); }, [refresh, rev]);

  // Canlı akış: yeni satır → liste + toast + tarayıcı bildirimi + ses (tercihe göre)
  const npRef = useRef(np); npRef.current = np;
  const visRef = useRef(visible); visRef.current = visible;
  useEffect(() => {
    if (!repo || !me || !prefsLoaded) return;
    return repo.subscribeNotifications((n) => {
      if (seen.current.has(n.id)) return;
      seen.current.add(n.id);
      setItems((cur) => [n, ...cur.filter((x) => x.id !== n.id)].slice(0, 50));
      if (!visRef.current(n)) return;
      setToasts((cur) => [...cur, { id: n.id, n, until: Date.now() + TOAST_MS }].slice(-MAX_TOASTS));
      setLive(`${n.title}. ${n.body}`);
      const p = npRef.current;
      if (p.sound) beep();
      if (p.channels.push && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        try {
          const b = new Notification(n.title, { body: n.body, tag: n.id, icon: '/favicon.svg' });
          b.onclick = () => { window.focus(); router.push(n.href ?? '/app/inbox'); b.close(); };
        } catch { /* tarayıcı desteklemiyor */ }
      }
    });
  }, [repo, me, prefsLoaded, router]);
  // Toast zamanlayıcısı (tek interval; sekme gizliyken de akar)
  useEffect(() => {
    if (!toasts.length) return;
    const t = window.setInterval(() => { const now = Date.now(); setToasts((cur) => cur.filter((x) => x.until > now)); }, 500);
    return () => window.clearInterval(t);
  }, [toasts.length]);

  const markRead = useCallback(async (ids: string[]) => {
    const todo = ids.filter((id) => items.some((x) => x.id === id && !x.read));
    if (!todo.length) return;
    setItems((cur) => cur.map((x) => (todo.includes(x.id) ? { ...x, read: true } : x)));
    try { await repo?.markNotificationsRead(todo); } catch { /* RLS / çevrimdışı: yerel durum kalır */ }
  }, [items, repo]);
  const markAllRead = useCallback(() => markRead(items.filter((x) => !x.read).map((x) => x.id)), [items, markRead]);
  const unread = useMemo(() => items.filter((x) => !x.read && visible(x)).length, [items, visible]);
  const value = useMemo<Ctx>(() => ({ items, unread, loading, markRead, markAllRead, refresh, visible }), [items, unread, loading, markRead, markAllRead, refresh, visible]);
  const dismiss = (id: string) => setToasts((cur) => cur.filter((x) => x.id !== id));
  return (
    <NotifCtx.Provider value={value}>
      {children}
      <span role="status" aria-live="polite" aria-atomic="true" className="wk-sr">{live}</span>
      {toasts.length > 0 && (
        <section className="ntf-toasts" aria-label="Yeni bildirimler">
          {toasts.map(({ id, n }) => (
            <div key={id} className="ntf-toast" role="alert">
              <span className="chip chip-brand ntf-kind">{notificationKindLabel(n.kind)}</span>
              <div className="min-w-0 flex-1"><strong className="block truncate">{n.title}</strong><p className="truncate">{n.body}</p></div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { dismiss(id); void markRead([id]); router.push(n.href ?? '/app/inbox'); }}>Aç</button>
                <button type="button" className="btn btn-ghost btn-sm icon-btn" style={{ width: 30, height: 30 }} aria-label={`${n.title} uyarısını kapat`} onClick={() => dismiss(id)}><X size={14} aria-hidden /></button>
              </div>
            </div>
          ))}
        </section>
      )}
    </NotifCtx.Provider>
  );
}

/** Kısa, yumuşak bip (WebAudio; izin gerektirmez, kullanıcı etkileşimi olmadan bazı tarayıcılarda sessiz kalabilir). */
function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(ctx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18); o.stop(ctx.currentTime + 0.2);
    o.onended = () => { void ctx.close(); };
  } catch { /* yok */ }
}

/** Zil + açılır panel: son 20, güne göre gruplu, okunmamış rozeti, tek / tümünü okundu, tıkla → kaynağa git. */
export function NotificationBell() {
  const { items, unread, loading, markRead, markAllRead, visible } = useNotifications();
  const { mode } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
  }, [open]);
  const nowIso = mode === 'demo' ? '2026-10-14T12:00:00Z' : new Date().toISOString();
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const groups = useMemo(() => groupByDay(items.slice(0, 20), nowIso, tz), [items, nowIso, tz]);
  const go = (n: Notification) => { setOpen(false); void markRead([n.id]); router.push(n.href ?? '/app/inbox'); };
  return (
    <div className="relative" ref={wrap}>
      <button type="button" className="btn btn-ghost icon-btn" aria-label={`Bildirimler (${unread} okunmamış)`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell size={17} />{unread > 0 && <span className="count-dot">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="ntf-pop" role="dialog" aria-label="Bildirimler">
          <header className="ntf-head">
            <strong>Bildirimler</strong>
            <div className="flex items-center gap-1">
              {unread > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markAllRead()} title="Tümünü okundu işaretle"><CheckCheck size={14} aria-hidden /> Tümü okundu</button>}
              <Link href="/app/profile?tab=notifications" className="btn btn-ghost btn-sm icon-btn" style={{ width: 32, height: 32 }} aria-label="Bildirim tercihleri" onClick={() => setOpen(false)}><Settings2 size={15} aria-hidden /></Link>
            </div>
          </header>
          <div className="ntf-body">
            {loading ? <p className="p-4 text-sm text-muted">Yükleniyor…</p> : items.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted"><BellOff size={16} aria-hidden /> Henüz bildirim yok.</p>
            ) : groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h3 className="ntf-day">{g.label}</h3>
                <ul>
                  {g.items.map((n) => (
                    <li key={n.id} className={`ntf-item ${n.read ? 'is-read' : ''} ${visible(n) ? '' : 'is-muted'}`}>
                      <button type="button" className="ntf-main" onClick={() => go(n)} title={notificationKindLabel(n.kind)}>
                        <span className={`ntf-dot ${n.read ? '' : 'on'}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{n.title}</span>
                          <span className="block truncate text-xs text-muted">{n.body}</span>
                          <span className="block text-[11px] text-muted">{notificationKindLabel(n.kind)} · {n.created_at.slice(11, 16)}</span>
                        </span>
                      </button>
                      {!n.read && <button type="button" className="btn btn-ghost btn-sm icon-btn" style={{ width: 30, height: 30 }} aria-label={`${n.title}: okundu`} onClick={() => void markRead([n.id])}><Check size={14} aria-hidden /></button>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <footer className="ntf-foot"><Link href="/app/inbox" className="text-button" onClick={() => setOpen(false)}>Gelen Kutusu’nu aç <ExternalLink size={13} aria-hidden /></Link></footer>
        </div>
      )}
    </div>
  );
}
