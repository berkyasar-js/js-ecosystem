'use client';
import { useData, todayFor } from './ui';
import { useSession } from './session';
import { capLabel, capStatus, monthOf } from '@/lib/agents/cap';

/** "Bu ay: ₺X / tavan ₺Y" + ilerleme çubuğu (agent_runs ay içi toplamı ↔ ai.monthly_cap_usd). */
export function CapMeter({ className = '' }: { className?: string }) {
  const { mode, rev } = useSession();
  const q = useData(async (r) => {
    const [settings, spent] = await Promise.all([r.getSettings(), r.monthlyAgentSpend(monthOf(todayFor(mode)))]);
    return capStatus(spent, settings.ai);
  }, [rev]);
  if (!q.data) return null;
  const s = q.data;
  const tone = s.exceeded ? 'bg-magenta' : s.pct >= 80 ? 'bg-[#ffb020]' : 'bg-[#3ddc97]';
  return (
    <div className={`nested ${className}`} data-testid="cap-meter">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <strong>{capLabel(s)}</strong>
        {s.unlimited ? <span className="chip">Sınırsız</span> : s.exceeded ? <span className="chip chip-bad">Tavan aşıldı — yeni ajan çalıştırmaları durdu</span> : <span className="chip">%{s.pct}</span>}
      </div>
      {!s.unlimited && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Aylık yapay zekâ maliyeti" aria-valuenow={s.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${tone}`} style={{ width: `${s.pct}%` }} />
        </div>
      )}
    </div>
  );
}
