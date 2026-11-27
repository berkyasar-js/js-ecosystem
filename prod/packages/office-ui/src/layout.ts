/**
 * @jscore/office-ui — ofis yerleşimi (saf). Katalogdan bağımsız: her "oturan" bir kimlik (slug) ve bir grup (division) taşır.
 */
export interface OfficeOccupant { slug: string; division: string }
/** Grup (oda) görünümü: etiket + renk. */
export interface OfficeGroup { label: string; color: string }
/** Masadaki kişinin/ajanın görünen adı. */
export interface OfficePerson { name: string; emoji?: string; /** Etikette gösterilen küçük portre (isteğe bağlı). */ image?: string }
export type SeatState = 'working' | 'recent' | 'idle';

/* ───────── Ofis yerleşimi (saf; birim ≈ metre) ───────── */
export interface Seat { slug: string; x: number; z: number }
export interface Room { division: string; x: number; z: number; w: number; d: number; seats: Seat[] }
export interface OfficeLayout { rooms: Room[]; width: number; depth: number }
const DESK_X = 1.6;
const DESK_Z = 1.9;
const PAD = 1.1;
const GAP = 1.6;

/**
 * Bölüm başına bir oda; odalar büyükten küçüğe raflara dizilir, tümü orijine ortalanır.
 * Aynı kadro → aynı yerleşim (deterministik): masa yerleri sabit kalır.
 */
export function officeLayout(roster: OfficeOccupant[], maxRowWidth = 66): OfficeLayout {
  const byDiv = new Map<string, OfficeOccupant[]>();
  for (const r of roster) byDiv.set(r.division, [...(byDiv.get(r.division) ?? []), r]);
  const groups = [...byDiv.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const rooms: Room[] = [];
  let cx = 0;
  let cz = 0;
  let rowDepth = 0;
  let width = 0;
  for (const [division, roles] of groups) {
    const cols = Math.max(2, Math.ceil(Math.sqrt(roles.length * 1.6)));
    const rows = Math.ceil(roles.length / cols);
    const w = cols * DESK_X + PAD * 2;
    const d = rows * DESK_Z + PAD * 2;
    if (cx > 0 && cx + w > maxRowWidth) { cx = 0; cz += rowDepth + GAP; rowDepth = 0; }
    const seats = [...roles].sort((a, b) => a.slug.localeCompare(b.slug)).map((r, i) => ({
      slug: r.slug,
      x: cx + PAD + (i % cols) * DESK_X + DESK_X / 2,
      z: cz + PAD + Math.floor(i / cols) * DESK_Z + DESK_Z / 2,
    }));
    rooms.push({ division, x: cx, z: cz, w, d, seats });
    cx += w + GAP;
    width = Math.max(width, cx - GAP);
    rowDepth = Math.max(rowDepth, d);
  }
  const depth = cz + rowDepth;
  const ox = width / 2;
  const oz = depth / 2;
  return {
    width, depth,
    rooms: rooms.map((r) => ({ ...r, x: r.x - ox, z: r.z - oz, seats: r.seats.map((s) => ({ ...s, x: s.x - ox, z: s.z - oz })) })),
  };
}

