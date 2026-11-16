'use client';
import { useEffect, useMemo, useState } from 'react';
import { NOTIFICATION_KINDS, NOTIFICATION_KIND_LABELS, ROLES, ROLE_LABELS, RULE_MODE_LABELS, ruleFromMode, ruleMode, type NotificationChannel, type NotificationKind, type NotificationRule, type Role, type RuleMode } from '@jscore/contracts';
import { Msg, errText } from './admin-ui';
import { useSession } from './session';

const CHANNELS: Array<[NotificationChannel, string]> = [['in_app', 'Uygulama içi'], ['email', 'E-posta']];
const INTERNAL = ROLES.filter((r) => r !== 'client_admin' && r !== 'client_viewer');
type Cell = { mode: RuleMode; roles: Role[] };
const key = (k: string, c: string) => `${k}|${c}`;

/**
 * Organizasyon → Bildirim kuralları: tür × kanal için "herkese açık / yalnızca roller / roller hariç / herkese kapalı".
 * Supabase: `notification_rules` (RLS owner/org_admin); demo: settings.notifications.rules. Kişi tercihlerinin üstünde kısıtlayıcıdır.
 */
export function NotificationRulesEditor() {
  const { repo, rev } = useSession();
  const [rules, setRules] = useState<NotificationRule[] | null>(null);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    repo.listNotificationRules().then((rs) => {
      if (!alive) return;
      setRules(rs);
      const c: Record<string, Cell> = {};
      for (const r of rs) if ((NOTIFICATION_KINDS as readonly string[]).includes(r.event_type) && r.channel !== 'slack') c[key(r.event_type, r.channel)] = { mode: ruleMode(r), roles: r.roles };
      setCells(c); setErr(null);
    }, (e: unknown) => alive && setErr(errText(e)));
    return () => { alive = false; };
  }, [repo, rev]);
  const dirty = useMemo(() => JSON.stringify(cells) !== JSON.stringify(fromRules(rules ?? [])), [cells, rules]);
  const set = (k: NotificationKind, ch: NotificationChannel, patch: Partial<Cell>) => setCells((c) => { const cur: Cell = c[key(k, ch)] ?? { mode: 'open', roles: [] }; return { ...c, [key(k, ch)]: { ...cur, ...patch } }; });
  const save = async () => {
    if (!repo || !rules) return;
    setBusy(true);
    try {
      const next: NotificationRule[] = [];
      for (const k of NOTIFICATION_KINDS) for (const [ch] of CHANNELS) {
        const c = cells[key(k, ch)]; const r = c ? ruleFromMode(c.mode, c.roles) : null;
        if (!r) continue;
        if ((c.mode === 'only' || c.mode === 'except') && !c.roles.length) throw new Error(`${NOTIFICATION_KIND_LABELS[k]} · ${ch === 'in_app' ? 'uygulama içi' : 'e-posta'}: en az bir rol seç`);
        const existing = rules.find((x) => x.event_type === k && x.channel === ch);
        next.push({ id: existing?.id, event_type: k, channel: ch, ...r });
      }
      // Slack ve bilinmeyen türlere dokunma (ileride).
      for (const r of rules) if (r.channel === 'slack' || !(NOTIFICATION_KINDS as readonly string[]).includes(r.event_type)) next.push(r);
      const saved = await repo.saveNotificationRules(next);
      setRules(saved); setCells(fromRules(saved)); setMsg({ ok: true, text: 'Bildirim kuralları kaydedildi.' });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  if (err) return <p role="alert" className="text-sm text-magenta">{err}</p>;
  if (!rules) return <p className="text-sm text-muted">Yükleniyor…</p>;
  return (
    <section className="card grid gap-4">
      <div><h2 className="font-bold">Bildirim kuralları</h2>
        <p className="mt-1 text-sm text-muted">Tür ve kanal başına organizasyon varsayılanı. “Herkese açık” = kişi kendi tercihine göre alır; diğer modlar kişi tercihinin üstünde kısıtlar. Müşteri rolleri bildirim almaz.</p></div>
      <Msg m={msg} />
      <div className="overflow-x-auto">
        <table className="table w-full text-sm">
          <thead><tr><th className="text-left">Bildirim</th>{CHANNELS.map(([c, l]) => <th key={c} className="text-left">{l}</th>)}</tr></thead>
          <tbody>
            {NOTIFICATION_KINDS.map((k) => (
              <tr key={k}>
                <td className="font-semibold">{NOTIFICATION_KIND_LABELS[k]}</td>
                {CHANNELS.map(([ch]) => { const c = cells[key(k, ch)] ?? { mode: 'open' as RuleMode, roles: [] as Role[] }; return (
                  <td key={ch} className="align-top">
                    <select className="input w-auto" aria-label={`${NOTIFICATION_KIND_LABELS[k]} ${ch === 'in_app' ? 'uygulama içi' : 'e-posta'} kuralı`} value={c.mode} onChange={(e) => set(k, ch, { mode: e.target.value as RuleMode })}>
                      {(Object.keys(RULE_MODE_LABELS) as RuleMode[]).map((m) => <option key={m} value={m}>{RULE_MODE_LABELS[m]}</option>)}
                    </select>
                    {(c.mode === 'only' || c.mode === 'except') && (
                      <div className="mt-1 flex max-w-[320px] flex-wrap gap-1">
                        {INTERNAL.map((r) => { const on = c.roles.includes(r); return <button key={r} type="button" className={`chip ${on ? 'chip-brand' : ''}`} aria-pressed={on} onClick={() => set(k, ch, { roles: on ? c.roles.filter((x) => x !== r) : [...c.roles, r] })}>{ROLE_LABELS[r]}</button>; })}
                      </div>
                    )}
                  </td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2"><button className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>Kuralları kaydet</button>{dirty && <span className="text-xs text-muted">Kaydedilmemiş değişiklik var.</span>}</div>
    </section>
  );
}
function fromRules(rs: NotificationRule[]): Record<string, Cell> {
  const c: Record<string, Cell> = {};
  for (const r of rs) if ((NOTIFICATION_KINDS as readonly string[]).includes(r.event_type) && r.channel !== 'slack') c[key(r.event_type, r.channel)] = { mode: ruleMode(r), roles: r.roles };
  return c;
}
