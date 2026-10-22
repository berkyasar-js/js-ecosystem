'use client';
import { useState } from 'react';
import { TASK_STATE_LABELS, type InboxDraftsOutput, type Message } from '@jscore/contracts';
import { annotateDrafts, usedThisMonth } from '@/lib/quota';
import { Async, Empty, PageHeader, fmtTime, money, todayFor, useData } from '@/components/ui';
import { useFeature, useSession } from '@/components/session';
import { agentRunBody } from '@jscore/core/agents/client';

type Annotated = ReturnType<typeof annotateDrafts>;

export default function Inbox() {
  const { repo, mode, bump } = useSession();
  const aiOn = useFeature('inbox.ai_drafts');
  const q = useData(async (r) => ({ inbox: await r.listInbox(), brands: await r.listBrands(), projects: await r.listProjects(), tasks: await r.listTasks(), types: await r.listTaskTypes() }));
  const [sel, setSel] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<{ summary: string; items: Annotated } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});

  const generate = async (m: Message, ctx: NonNullable<typeof q.data>) => {
    setBusy(true); setMsg(null); setDrafts(null); setDone({});
    try {
      const res = await fetch('/api/agents/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await agentRunBody(repo, todayFor(mode), { agent: 'inbox_drafts', input: { message_id: m.id, subject: m.meta.subject, body: m.body, brand_id: m.meta.brand_id } })) });
      const j = (await res.json()) as { output?: InboxDraftsOutput; error?: string; mode?: string };
      if (!res.ok || !j.output) throw new Error(j.error ?? 'Ajan çalışmadı');
      const brand = ctx.brands.find((b) => b.id === m.meta.brand_id);
      const pb = Object.fromEntries(ctx.projects.map((p) => [p.id, p.brand_id]));
      const used = usedThisMonth(ctx.tasks, pb, brand?.id ?? '', new Date(`${todayFor(mode)}T12:00:00Z`));
      setDrafts({ summary: j.output.summary, items: annotateDrafts(j.output.drafts, brand, used, ctx.types) });
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Hata'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Akıllı Gelen Kutusu" sub="Gmail → CRM eşleştirme → AI görev taslağı → onay" />
      <Async q={q}>{(ctx) => ctx.inbox.length === 0 ? <Empty>Gelen kutusu boş.</Empty> : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <ul className="grid content-start gap-2" aria-label="Mesajlar">
            {ctx.inbox.map((m) => (
              <li key={m.id}>
                <button onClick={() => { setSel(m.id); setDrafts(null); setMsg(null); }} className={`nested w-full text-left ${sel === m.id ? 'ring-2 ring-accent' : ''}`}>
                  <div className="flex justify-between gap-2"><strong className="truncate">{m.author_name}</strong><span className="text-[11px] text-muted">{fmtTime(m.created_at)}</span></div>
                  <div className="truncate text-sm">{m.meta.subject}</div>
                  <div className="mt-1 truncate text-xs text-muted">{m.body}</div>
                </button>
              </li>
            ))}
          </ul>
          {(() => {
            const m = ctx.inbox.find((x) => x.id === sel);
            if (!m) return <Empty>Soldan bir mesaj seç.</Empty>;
            const brand = ctx.brands.find((b) => b.id === m.meta.brand_id);
            const brandProjects = ctx.projects.filter((p) => p.brand_id === brand?.id);
            return (
              <article className="card">
                <header className="mb-4">
                  <h2 className="text-lg font-bold">{m.meta.subject}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{m.meta.from}</span>{brand && <span className="chip chip-brand">CRM: {brand.name}</span>}
                    {brand && Object.keys(brand.monthly_quota).length > 0 && <span className="chip">Kota: {Object.entries(brand.monthly_quota).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>}</div>
                </header>
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                {aiOn ? <button className="btn btn-primary mt-5" disabled={busy} onClick={() => generate(m, ctx)}>{busy ? 'Taslaklar hazırlanıyor…' : 'AI görev taslakları'}</button> : <p className="mt-5 text-xs text-muted">AI görev taslakları yöneticin tarafından kapatıldı.</p>}
                {msg && <p role="alert" className="mt-3 text-sm text-magenta">{msg}</p>}
                {drafts && (
                  <div className="mt-5 grid gap-3">
                    <p className="text-xs text-muted">{drafts.summary}</p>
                    {drafts.items.map((d, i) => (
                      <div key={i} className="nested">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{d.title} <span className="font-normal text-muted">×{d.qty}</span></strong>
                          <span className="flex gap-2"><span className="chip">{d.task_type}</span><span className="chip">{d.due_at}</span>
                            {d.quota.limit === null ? <span className="chip">Kota tanımsız</span> : d.quota.within ? <span className="chip chip-ok">Kota içinde ({d.quota.used + d.qty}/{d.quota.limit})</span> : <span className="chip chip-bad">Kota aşımı +{d.quota.over_by}{d.quota.suggested_amount_minor ? ` · ${money(d.quota.suggested_amount_minor)}` : ''}</span>}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted">{d.rationale}</p>
                        <div className="mt-3">
                          {done[i] ? <span className="chip chip-ok">{done[i]}</span> : (
                            <button className="btn btn-sm" disabled={!brandProjects[0]} onClick={async () => {
                              if (!repo || !brandProjects[0]) return;
                              try {
                                if (d.quota.requires_approval) {
                                  await repo.createApproval({ action_type: 'scope', title: `${brand?.name} · ${d.title} (kapsam dışı)`, subject: { brand_id: brand?.id, project_id: brandProjects[0].id, amount_minor: d.quota.suggested_amount_minor || undefined, note: `Gelen kutusu: ${m.id}` }, required_role: 'account', due_at: d.due_at });
                                  setDone((s) => ({ ...s, [i]: 'Onaya gönderildi' }));
                                } else {
                                  await repo.createTask({ project_id: brandProjects[0].id, title: d.title, due_at: d.due_at, priority: d.priority, task_type: d.task_type, qty: d.qty, source_ref: `inbox:${m.id}` });
                                  setDone((s) => ({ ...s, [i]: `Görev oluşturuldu (${TASK_STATE_LABELS.brief})` }));
                                }
                                bump();
                              } catch (e) { setMsg(e instanceof Error ? e.message : 'Hata'); }
                            }}>{d.quota.requires_approval ? 'Kapsam dışı → Onaya gönder' : 'Görev olarak oluştur'}</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })()}
        </div>
      )}</Async>
    </>
  );
}
