'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { agentRunBody } from '@jscore/core/agents/client';
import { ErrorBox, Loading, PageHeader, todayFor } from '@/components/ui';
import { useCan, useSession } from '@/components/session';
import { AtelierIcon } from '@/components/atelier-icon';
import { HUB_PROVIDER_INFO, type HubChoice, type HubContext, type HubMessage, type HubProvider, type QuotaStatus } from '@jscore/ai-hub';

interface ProviderInfo { id: HubProvider; label: string; vendor: string; strength: string; available: boolean }
interface Status { demo: boolean; context: HubContext; quota: QuotaStatus | null; usd_try: number; providers: ProviderInfo[] }
interface Turn extends HubMessage { provider?: HubProvider; reason?: string; fallback?: boolean; demo?: boolean }
const STORE = 'js_ai_hub_v1';
const usd = (n: number) => `$${n.toFixed(2)}`;

export default function AiHub() {
  const { repo, mode } = useSession();
  const canRun = useCan('agents.run');
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [choice, setChoice] = useState<HubChoice>('auto');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-hub/status', { cache: 'no-store' });
      const j = await res.json() as Status & { error?: string };
      if (!res.ok) throw new Error(j.error ?? 'Durum okunamadı');
      setStatus(j); setStatusErr(null);
    } catch (e) { setStatusErr(e instanceof Error ? e.message : 'Durum okunamadı'); }
  }, []);
  useEffect(() => { void loadStatus(); }, [loadStatus]);
  // Sohbet yalnızca bu sekmede tutulur (sessionStorage): sunucuya ve veritabanına içerik yazılmaz.
  useEffect(() => { try { const raw = sessionStorage.getItem(STORE); if (raw) setTurns(JSON.parse(raw) as Turn[]); } catch { /* yok */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-40))); } catch { /* yok */ } endRef.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);

  async function send() {
    const text = draft.trim();
    if (!text || busy || !repo) return;
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next); setDraft(''); setBusy(true); setErr(null);
    try {
      const extra = await agentRunBody(repo, todayFor(mode), { agent: 'hub', input: {} });
      const spend = 'demo_spend_usd' in extra ? { demo_spend_usd: extra.demo_spend_usd, demo_cap_usd: extra.demo_cap_usd } : {};
      const res = await fetch('/api/ai-hub/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: choice, messages: next.map(({ role, content }) => ({ role, content })), ...spend }) });
      const j = await res.json() as { text?: string; provider?: HubProvider; reason?: string; fallback?: boolean; mode?: string; error?: string };
      if (!res.ok || !j.text || !j.provider) throw new Error(j.error ?? 'Yanıt alınamadı');
      setTurns([...next, { role: 'assistant', content: j.text, provider: j.provider, reason: j.reason, fallback: j.fallback, demo: j.mode === 'demo' }]);
      void loadStatus();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Yanıt alınamadı'); setTurns(turns); setDraft(text); }
    finally { setBusy(false); }
  }

  const ctx = status?.context;
  const anyAvailable = status?.providers.some((p) => p.available) ?? false;
  const quota = status?.quota;
  return (
    <>
      <PageHeader title="AI Çalışma Alanı" eyebrow="ZEKÂ" sub="Claude, ChatGPT ve Gemini tek ekranda; rolüne ve görebildiğin marka / projelere göre bağlamla yanıt verir."
        actions={turns.length > 0 ? <button type="button" className="btn btn-sm" onClick={() => { setTurns([]); setErr(null); }}>Sohbeti temizle</button> : undefined} />
      {statusErr && <ErrorBox message={statusErr} />}
      <div className="hub-grid">
        <section className="card hub-chat" aria-label="Sohbet">
          <div className="hub-log" role="log" aria-live="polite" aria-label="Mesajlar">
            {turns.length === 0 && (
              <div className="hub-empty">
                <h2 className="font-bold">Ne üzerinde çalışıyorsun?</h2>
                <p className="mt-1 text-sm text-muted">Sorunu yaz; model seçimini sana bırakabilir ya da “Otomatik” ile işin türüne göre seçtirebilirsin. Sohbet yalnızca bu sekmede tutulur.</p>
              </div>
            )}
            {turns.map((t, i) => (
              <article key={i} className={`hub-msg ${t.role === 'user' ? 'is-user' : ''}`}>
                <header className="hub-msg-head">
                  <strong>{t.role === 'user' ? 'Sen' : HUB_PROVIDER_INFO[t.provider ?? 'claude'].label}</strong>
                  {t.role === 'assistant' && t.reason && <span className="text-xs text-muted">{t.fallback ? 'Yedek seçim' : 'Seçim'}: {t.reason}</span>}
                  {t.demo && <span className="chip chip-warn">Demo yanıtı</span>}
                </header>
                <div className="hub-msg-body">{t.content}</div>
                {t.role === 'assistant' && (
                  <footer className="hub-msg-actions">
                    <Link className="btn btn-sm" href={`/app/agency?brief=${encodeURIComponent(t.content.slice(0, 1500))}`}>Ajana görev olarak ata</Link>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { void navigator.clipboard?.writeText(t.content).then(() => { setCopied(i); window.setTimeout(() => setCopied(null), 1500); }); }}>{copied === i ? 'Kopyalandı' : 'Kopyala'}</button>
                  </footer>
                )}
              </article>
            ))}
            {busy && <div className="hub-msg" aria-busy="true"><Loading rows={2} /></div>}
            <div ref={endRef} />
          </div>
          {err && <ErrorBox message={err} />}
          <form className="hub-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="label" htmlFor="hub-input">Mesajın</label>
            <textarea id="hub-input" className="input" rows={3} maxLength={8000} placeholder="Örn. Anova lansmanı için üç başlık öner ve hangisini neden seçeceğini yaz."
              value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); } }} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">Göndermek için Ctrl / ⌘ + Enter.</p>
              <button className="btn btn-primary" disabled={!canRun || busy || !draft.trim() || !anyAvailable || !!quota?.exceeded}>{busy ? 'Yanıt bekleniyor…' : 'Gönder'}</button>
            </div>
            {!canRun && <p className="text-xs text-muted">Ajan çalıştırma yetkin yok (yetki matrisi → “Ajan çalıştır”).</p>}
            {status && !anyAvailable && <p className="text-xs text-danger">Hiçbir sağlayıcı için API anahtarı tanımlı değil.</p>}
          </form>
        </section>

        <aside className="grid content-start gap-4">
          <section className="card" aria-label="Model seçimi">
            <h2 className="font-bold">Model</h2>
            {!status ? <Loading rows={3} /> : (
              <fieldset className="hub-models">
                <legend className="sr-only">Yanıtı hangi model versin?</legend>
                <label className="hub-model"><input type="radio" name="hub-model" checked={choice === 'auto'} onChange={() => setChoice('auto')} />
                  <span><strong>Otomatik</strong><span>İşin türüne göre seçer (kurallı; model harcamaz)</span></span></label>
                {status.providers.map((p) => (
                  <label key={p.id} className={`hub-model ${p.available ? '' : 'is-off'}`}><input type="radio" name="hub-model" disabled={!p.available} checked={choice === p.id} onChange={() => setChoice(p.id)} />
                    <span><strong>{p.label} <span className="font-normal text-muted">· {p.vendor}</span></strong><span>{p.available ? p.strength : `Kullanılamıyor: ${HUB_PROVIDER_INFO[p.id].env} tanımlı değil`}</span></span></label>
                ))}
              </fieldset>
            )}
            {status?.demo && <p className="mt-3 text-xs text-muted">Demo modunda gerçek model çağrısı yapılmaz; örnek yanıt üretilir.</p>}
          </section>

          <section className="card" aria-label="Modele verilen bağlam">
            <h2 className="flex items-center gap-2 font-bold"><AtelierIcon id="brief" size={16} /> Modele verilen bağlam</h2>
            {!ctx ? <Loading rows={3} /> : (
              <dl className="hub-dl">
                <div><dt>Rol</dt><dd>{ctx.roleLabel} · {ctx.tierLabel}</dd></div>
                <div><dt>Departman</dt><dd>{ctx.department ?? <span className="text-muted">Belirtilmemiş</span>}</dd></div>
                <div><dt>Markalar</dt><dd>{ctx.brands.length ? `${ctx.brands.length} marka` : <span className="text-muted">Yok</span>}</dd></div>
                <div><dt>Projeler</dt><dd>{ctx.projects.length ? `${ctx.projects.length} açık proje` : <span className="text-muted">Yok</span>}</dd></div>
              </dl>
            )}
            <p className="mt-3 text-xs text-muted">Modele yalnızca görebildiğin marka ve proje adları verilir; kayıt içeriği, finans ya da kişisel veri verilmez.</p>
          </section>

          <section className="card" aria-label="Kullanım">
            <h2 className="flex items-center gap-2 font-bold"><AtelierIcon id="chart" size={16} /> Kullanım · bu ay</h2>
            {!status ? <Loading rows={2} /> : status.demo ? <p className="mt-2 text-sm text-muted">Demo modunda kullanım ölçülmez.</p> : !ctx?.department ? <p className="mt-2 text-sm text-muted">Departmanın tanımlı değil; departman kotası uygulanmıyor (kurum tavanı geçerli).</p> : !quota ? <p className="mt-2 text-sm text-muted">Hesaplanamadı.</p> : (
              <>
                <p className="mt-2 text-sm"><strong className="num">{usd(quota.spentUsd)}</strong> {quota.capUsd ? <>/ <span className="num">{usd(quota.capUsd)}</span></> : <span className="text-muted">· kota tanımlı değil</span>} <span className="text-muted">· {ctx.department}</span></p>
                {quota.capUsd && <div className="portfolio-bar mt-2 w-full" role="img" aria-label={`Kotanın yüzde ${quota.pct}'i kullanıldı`}><span style={{ width: `${quota.pct}%`, background: quota.exceeded ? 'var(--danger)' : undefined }} /></div>}
                {quota.exceeded && <p className="mt-2 text-xs text-danger">Departman kotası doldu; yeni istek gönderilemez.</p>}
                <p className="mt-2 text-xs text-muted">Departmanın tüm yapay zekâ çalıştırmaları (bu alan + Ajans Ofisi). Tutarlar tahminidir.</p>
              </>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
