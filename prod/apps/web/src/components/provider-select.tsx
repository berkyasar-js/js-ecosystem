'use client';
import { useEffect, useState } from 'react';
import type { HubProvider } from '@jscore/ai-hub';

export interface ProviderOption { id: HubProvider; label: string; strength: string; available: boolean }
/** Ajan çalıştırırken seçilebilecek sağlayıcılar. Liste okunamazsa yalnızca Claude sunulur. */
export function useProviders(): ProviderOption[] {
  const [list, setList] = useState<ProviderOption[]>([{ id: 'claude', label: 'Claude', strength: '', available: true }]);
  useEffect(() => {
    let alive = true;
    fetch('/api/ai/providers', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j: { providers?: ProviderOption[] } | null) => { if (alive && j?.providers?.length) setList(j.providers); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return list;
}
/** Model seçimi. Anahtarı tanımlı olmayan sağlayıcı seçilemez ve nedeni görünür. */
export function ProviderSelect({ id, value, onChange, providers, disabled }: { id: string; value: HubProvider; onChange: (p: HubProvider) => void; providers: ProviderOption[]; disabled?: boolean }) {
  const missing = providers.filter((p) => !p.available).map((p) => p.label);
  return (
    <div>
      <label className="label" htmlFor={id}>Model</label>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as HubProvider)}>
        {providers.map((p) => <option key={p.id} value={p.id} disabled={!p.available}>{p.label}{p.available ? '' : ' — anahtar tanımlı değil'}</option>)}
      </select>
      {missing.length > 0 && <p className="mt-1 text-xs text-muted">{missing.join(' ve ')} için yöneticinin API anahtarını tanımlaması gerekir.</p>}
    </div>
  );
}
