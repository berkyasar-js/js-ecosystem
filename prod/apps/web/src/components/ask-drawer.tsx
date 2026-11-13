'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageCircleQuestion, Send, X } from 'lucide-react';
import type { Approval, Brand, Project, Task, TeamMember } from '@jscore/contracts';
import { answerLocally, type AskAnswer } from '@/lib/ask';
import { useSession } from './session';
import { todayFor } from './ui';

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? '';
const SUGGESTIONS = ['Bugün ne teslim?', 'Neler gecikti?', 'Kim yoğun?', 'Bekleyen onaylar'];

/** Ctrl+J "Sor": yerel veriden kurallı yanıt. LLM yok; owner için Kurul Sohbeti (yönetim paneli) bağlantısı. */
export function AskDrawer({ open, onClose }: { open: boolean; onClose(): void }) {
  const { repo, me, mode } = useSession();
  const [q, setQ] = useState('');
  const [log, setLog] = useState<Array<{ q: string; a: AskAnswer }>>([]);
  const [ctx, setCtx] = useState<{ tasks: Task[]; projects: Project[]; brands: Brand[]; team: TeamMember[]; approvals: Approval[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open || !repo) return;
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    Promise.all([safe(repo.listTasks()), safe(repo.listProjects()), safe(repo.listBrands()), safe(repo.team()), safe(repo.listApprovals())]).then(([tasks, projects, brands, team, approvals]) => setCtx({ tasks, projects, brands, team, approvals }));
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [open, repo]);
  if (!open) return null;
  const ask = (text: string) => {
    if (!ctx || !text.trim()) return;
    setLog((l) => [...l, { q: text, a: answerLocally(text, { ...ctx, today: todayFor(mode), employeeId: me?.employee_id }) }].slice(-8));
    setQ('');
  };
  return (
    <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Sor" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-2 border-b border-line pb-3">
          <h2 className="flex items-center gap-2 font-bold"><MessageCircleQuestion size={18} aria-hidden /> Sor <kbd className="chip">⌘ J</kbd></h2>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Kapat"><X size={16} /></button>
        </header>
        <p className="mt-3 text-xs text-muted">Yanıtlar yalnızca bu organizasyonun verisinden, cihazında hesaplanır. Yapay zekâ çağrısı yapılmaz.</p>
        <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} className="btn btn-sm" onClick={() => ask(s)} disabled={!ctx}>{s}</button>)}</div>
        <div className="mt-4 grid gap-3 overflow-y-auto" aria-live="polite">
          {log.length === 0 && <p className="text-sm text-muted">Örnek: “Anova ne durumda?”, “Seda neler yapıyor?”</p>}
          {log.map((e, i) => (
            <div key={i} className="nested">
              <div className="text-xs font-semibold text-muted">{e.q}</div>
              <div className="mt-1 font-bold">{e.a.title}</div>
              <ul className="mt-1 grid gap-0.5 text-sm">{e.a.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
              {e.a.href && <Link href={e.a.href} onClick={onClose} className="text-button mt-1">Aç <ArrowRight size={14} aria-hidden /></Link>}
            </div>
          ))}
        </div>
        <form className="mt-auto flex gap-2 pt-3" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input ref={inputRef} className="input" placeholder="Soru yaz…" aria-label="Soru" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary icon-btn" aria-label="Gönder" disabled={!ctx}><Send size={16} /></button>
        </form>
        {me && (me.role === 'owner' || me.role === 'org_admin') && ADMIN_URL && <a className="mt-2 text-xs text-muted underline" href={`${ADMIN_URL}/admin/board/sohbet`} target="_blank" rel="noreferrer">Derin analiz için Kurul Sohbeti (yönetim paneli) →</a>}
      </aside>
    </div>
  );
}
