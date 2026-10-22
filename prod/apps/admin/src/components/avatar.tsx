import { initials } from './ui';

/** Kurgusal ekip portreleri (2×2 sprite). Prototipteki avatar() ile aynı kırpma matematiği. */
const PORTRAITS: Record<string, number> = { BY: 3, UC: 0, OE: 1, SO: 2, SK: 1, DO: 2, RV: 3, HO: 0, BA: 2, FA: 1 };
const PFACE: Array<[number, number]> = [[0.5, 0.36], [0.5, 0.36], [0.5, 0.38], [0.47, 0.34]];
const Z = 1.6;

export const portraitIdx = (id: string): number => {
  if (PORTRAITS[id] != null) return PORTRAITS[id];
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
};

/** id: çalışan kimliği (BY, OE…) ya da kararlı herhangi bir kimlik; boşsa yalnız baş harfler. */
export function Avatar({ id, name, size, className = '' }: { id?: string; name: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const ini = initials(name) || '?';
  const cls = `avatar ${size ?? ''} ${className}`.trim();
  if (!id) return <span className={cls} title={name}>{ini}</span>;
  const i = portraitIdx(id);
  const col = i % 2, row = Math.floor(i / 2), [fx, fy] = PFACE[i];
  const left = (50 - (col + fx) * Z * 100).toFixed(1), top = (50 - (row + fy) * Z * 100).toFixed(1);
  return (
    <span className={`${cls} pt`} title={name}>
      <b className="ini" aria-hidden="true">{ini}</b>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/team-portraits.jpg" alt="" loading="lazy" decoding="async" width={Z * 200} height={Z * 200} style={{ width: `${Z * 200}%`, height: `${Z * 200}%`, left: `${left}%`, top: `${top}%` }} />
    </span>
  );
}
