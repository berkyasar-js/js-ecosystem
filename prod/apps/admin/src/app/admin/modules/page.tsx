'use client';
import { useMemo, useState } from 'react';
import { ALWAYS_ON_MODULES, FEATURES, GROUP_LABELS, MODULES, featureEnabled, featuresOf, moduleFlagKey, moduleEntitled, type ModuleGroup } from '@jscore/contracts';
import { Async, PageHeader } from '@/components/ui';
import { Msg, Switch, errText } from '@/components/admin-ui';
import { useAdminSettings } from '@/lib/client';

const GROUPS: ModuleGroup[] = ['main', 'work', 'creative', 'people', 'intel', 'manage'];

export default function Modules() {
  const st = useAdminSettings();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const flags = st.settings?.feature_flags;
  const toggles = st.settings?.feature_toggles;
  const q = useMemo(() => ({ data: st.settings, error: st.error, loading: st.loading }), [st.settings, st.error, st.loading]);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(null); }
  };
  const setModule = (id: string, on: boolean) => run(`m:${id}`, () => st.save({ feature_flags: { ...(flags ?? {}), [moduleFlagKey(id)]: on } }), on ? 'Modül açıldı — kullanıcı uygulamasında menüye döner.' : 'Modül kapatıldı — menüden ve rotalardan kalktı.');
  const setFeature = (key: string, on: boolean) => run(`f:${key}`, () => st.save({ feature_toggles: { ...(toggles ?? {}), [key]: on } }), on ? 'Özellik açıldı.' : 'Özellik kapatıldı.');

  return (
    <>
      <PageHeader title="Modüller & Özellikler" sub="Modülleri aç/kapat; her modülün özelliklerini ayrı ayrı yönet. Değişiklik kullanıcı uygulamasında bir sonraki yenilemede etkin olur." />
      <Msg m={msg} />
      <Async q={q}>{() => (
        <div className="grid gap-6">
          {GROUPS.map((g) => {
            const mods = MODULES.filter((m) => m.group === g && m.id !== 'apps');
            if (!mods.length) return null;
            return (
              <section key={g} aria-label={GROUP_LABELS[g]}>
                <div className="nav-label !px-0">{GROUP_LABELS[g]}</div>
                <ul className="grid gap-3">
                  {mods.map((m) => {
                    const locked = (ALWAYS_ON_MODULES as readonly string[]).includes(m.id);
                    const adminOnly = ['board', 'admin', 'integrations', 'automations', 'marketplace'].includes(m.id);
                    const on = moduleEntitled(m.id, flags);
                    const feats = featuresOf(m.id);
                    const expanded = open === m.id;
                    const offCount = feats.filter((f) => !featureEnabled(toggles, f.key)).length;
                    return (
                      <li key={m.id} className="card">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="font-bold">{m.name} <span className={`chip ml-1 ${on ? 'chip-ok' : ''}`}>{on ? 'Açık' : 'Kapalı'}</span>{adminOnly && <span className="chip chip-brand ml-1">Yönetim panelinde</span>}{locked && !adminOnly && <span className="chip ml-1">Zorunlu</span>}</h2>
                            <p className="mt-1 text-sm text-muted">{m.desc}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            {feats.length > 0 && <button className="btn btn-sm" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : m.id)}>Özellikler ({feats.length - offCount}/{feats.length})</button>}
                            <Switch label={on ? 'Menüde' : 'Gizli'} checked={on} disabled={locked || busy === `m:${m.id}`} onChange={(v) => void setModule(m.id, v)} />
                          </div>
                        </div>
                        {expanded && (
                          <ul className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
                            {feats.map((f) => (
                              <li key={f.key} className="nested">
                                <Switch label={f.label} checked={featureEnabled(toggles, f.key)} disabled={!on || busy === `f:${f.key}`} onChange={(v) => void setFeature(f.key, v)} />
                                <p className="mt-1 text-xs text-muted">{f.desc} <code>{f.key}</code>{f.agent && <> · sunucuda da uygulanır</>}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <p className="text-xs text-muted">{FEATURES.length} özellik anahtarı tanımlı. Anahtar yoksa özellik açıktır. Modül kapalıyken özellikleri de kullanılamaz. Görev ayrıntısı, ihale ve pano özellikleri “JS Work · Görevler” altındadır.</p>
        </div>
      )}</Async>
    </>
  );
}
