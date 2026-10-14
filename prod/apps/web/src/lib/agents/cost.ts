/** USD / 1M token (giriş, çıkış). Bilinmeyen model için Sonnet fiyatı varsayılır. */
const PRICES: Record<string, [number, number]> = { haiku: [1, 5], sonnet: [3, 15], opus: [15, 75] };
export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const key = Object.keys(PRICES).find((k) => model.includes(k)) ?? 'sonnet';
  const [pi, po] = PRICES[key];
  return Math.round(((tokensIn * pi + tokensOut * po) / 1_000_000) * 100000) / 100000;
}
