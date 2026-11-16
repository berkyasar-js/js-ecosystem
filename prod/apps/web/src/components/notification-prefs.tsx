'use client';
import { useEffect, useState } from 'react';
import { BellRing, Mail, Moon, Volume2 } from 'lucide-react';
import { INSTANT_EMAIL_KINDS, NOTIFICATION_KIND_GROUPS, NOTIFICATION_KIND_LABELS, kindPref, type NotificationKind, type NotificationPrefs } from '@jscore/contracts';
import { useSession } from './session';
import { useToast } from './toasts';

type Perm = 'default' | 'granted' | 'denied' | 'unsupported';
const permOf = (): Perm => (typeof window === 'undefined' || typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

/** Profil → Bildirimler: kanallar, tarayıcı izni (yalnızca burada istenir), ses, özet, sessiz saatler, tür başına uygulama içi / e-posta. */
export function NotificationPrefsPanel() {
  const { prefs, setPrefs, repo, me, mode } = useSession();
  const toast = useToast();
  const np = prefs.notifications;
  const [perm, setPerm] = useState<Perm>('default');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPerm(permOf()); }, []);
  const patch = (p: Partial<NotificationPrefs>) => void setPrefs({ notifications: { ...np, ...p } });
  const setKind = (k: NotificationKind, field: 'inapp' | 'email', v: boolean) => patch({ kinds: { ...np.kinds, [k]: { ...kindPref(np, k), [field]: v } } });
  const togglePush = async (on: boolean) => {
    if (!on) { patch({ channels: { ...np.channels, push: false } }); return; }
    if (perm === 'unsupported') return;
    let p: Perm = perm;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } setPerm(p); }
    patch({ channels: { ...np.channels, push: p === 'granted' } });
  };
  const testNotify = async () => {
    if (!repo || !me?.employee_id) return;
    setBusy(true);
    try {
      await repo.save('notifications', { employee_id: me.employee_id, kind: 'system', title: 'Deneme bildirimi', body: 'Bildirim merkezi çalışıyor. Bu satırı okundu işaretleyebilirsin.', read: false, href: '/app/profile?tab=notifications' });
      toast.success('Deneme bildirimi yazıldı', mode === 'demo' ? 'Sağ altta uyarı olarak görünür.' : 'Realtime açıksa birkaç saniye içinde sağ altta görünür.');
    } catch { toast.success('Deneme bildirimi yazılamadı', 'Yetki ya da bağlantı sorunu.'); }
    finally { setBusy(false); }
  };
  const quiet = np.quiet_hours;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card grid gap-3">
        <h2 className="font-bold">Kanallar</h2>
        <label className="nested flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><BellRing size={16} aria-hidden /> Uygulama içi (zil, açılır uyarı)</span><input type="checkbox" checked={np.channels.inapp} onChange={(e) => patch({ channels: { ...np.channels, inapp: e.target.checked } })} /></label>
        <label className="nested flex items-center justify-between gap-3 text-sm">
          <span className="flex flex-col"><span className="flex items-center gap-2"><BellRing size={16} aria-hidden /> Tarayıcı bildirimi (sekme arka plandayken)</span>
            <span className="text-xs text-muted">{perm === 'unsupported' ? 'Bu tarayıcı desteklemiyor' : perm === 'denied' ? 'Tarayıcıda engellendi — site ayarlarından izin ver' : perm === 'granted' ? 'İzin verildi' : 'Açınca tarayıcı izin ister'}</span></span>
          <input type="checkbox" checked={np.channels.push && perm === 'granted'} disabled={perm === 'unsupported' || perm === 'denied'} onChange={(e) => void togglePush(e.target.checked)} />
        </label>
        <label className="nested flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Volume2 size={16} aria-hidden /> Ses</span><input type="checkbox" checked={np.sound} onChange={(e) => patch({ sound: e.target.checked })} /></label>
        <label className="nested flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><Mail size={16} aria-hidden /> E-posta</span><input type="checkbox" checked={np.channels.email} onChange={(e) => patch({ channels: { ...np.channels, email: e.target.checked } })} /></label>
        <p className="text-xs text-muted">Anlık e-posta yalnızca onay isteği, anma ve görev atamasında gider; diğer türler özete girer. Kapatırsan özet de gönderilmez.</p>
        <button className="btn btn-sm w-fit" disabled={busy || !me?.employee_id} onClick={() => void testNotify()}>Deneme bildirimi gönder</button>
      </section>
      <section className="card grid gap-3">
        <h2 className="font-bold">E-posta özeti</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Özet sıklığı">
          {([['off', 'Kapalı'], ['daily', 'Günlük · 08:30'], ['weekly', 'Haftalık · Pazartesi 08:30']] as const).map(([v, label]) => (
            <button key={v} role="radio" aria-checked={np.digest === v} className={`btn btn-sm ${np.digest === v ? 'btn-primary' : ''}`} disabled={!np.channels.email} onClick={() => patch({ digest: v })}>{label}</button>
          ))}
        </div>
        <p className="text-xs text-muted">Özet: bugün biten ve geciken işlerin, sırandaki onaylar, okunmamış bildirim sayısı, yeni duyurular. Saat organizasyon saat dilimine göredir.</p>
        <h2 className="mt-2 flex items-center gap-2 font-bold"><Moon size={16} aria-hidden /> Sessiz saatler</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!quiet} onChange={(e) => patch({ quiet_hours: e.target.checked ? { from: '22:00', to: '08:00' } : null })} /> Bu saatlerde anlık e-posta gönderme (özete ertelenir)</label>
        {quiet && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">Başlangıç <input type="time" className="input w-auto" value={quiet.from} onChange={(e) => patch({ quiet_hours: { ...quiet, from: e.target.value || quiet.from } })} /></label>
            <label className="flex items-center gap-2">Bitiş <input type="time" className="input w-auto" value={quiet.to} onChange={(e) => patch({ quiet_hours: { ...quiet, to: e.target.value || quiet.to } })} /></label>
          </div>
        )}
      </section>
      <section className="card lg:col-span-2">
        <h2 className="mb-3 font-bold">Tür başına</h2>
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead><tr><th className="text-left">Bildirim</th><th>Uygulama içi</th><th>E-posta</th></tr></thead>
            <tbody>
              {NOTIFICATION_KIND_GROUPS.map((g) => (
                <GroupRows key={g.label} label={g.label} kinds={g.kinds} np={np} onChange={setKind} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Uygulama içi kapalı tür için uyarı / rozet / tarayıcı bildirimi üretilmez; merkezde sönük listelenir. ⚡ işaretli türler e-postayı anında, diğerleri özette alır. Organizasyon kuralları (panel → Organizasyon → Bildirim kuralları) bu tercihlerin üstünde kısıtlayıcıdır.</p>
      </section>
    </div>
  );
}
function GroupRows({ label, kinds, np, onChange }: { label: string; kinds: NotificationKind[]; np: NotificationPrefs; onChange(k: NotificationKind, f: 'inapp' | 'email', v: boolean): void }) {
  return (
    <>
      <tr><th colSpan={3} className="pt-3 text-left text-xs font-bold uppercase tracking-wide text-muted">{label}</th></tr>
      {kinds.map((k) => { const kp = kindPref(np, k); return (
        <tr key={k}>
          <td>{NOTIFICATION_KIND_LABELS[k]}{INSTANT_EMAIL_KINDS.includes(k) && <span className="ml-1" title="Anlık e-posta">⚡</span>}</td>
          <td className="text-center"><input type="checkbox" aria-label={`${NOTIFICATION_KIND_LABELS[k]} uygulama içi`} checked={kp.inapp} disabled={!np.channels.inapp} onChange={(e) => onChange(k, 'inapp', e.target.checked)} /></td>
          <td className="text-center"><input type="checkbox" aria-label={`${NOTIFICATION_KIND_LABELS[k]} e-posta`} checked={kp.email} disabled={!np.channels.email} onChange={(e) => onChange(k, 'email', e.target.checked)} /></td>
        </tr>
      ); })}
    </>
  );
}
