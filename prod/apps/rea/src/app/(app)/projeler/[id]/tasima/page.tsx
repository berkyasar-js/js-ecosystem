import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlanActions } from '@/components/plan-view';
import { Empty } from '@/components/ui';
import { access } from '@/lib/data';
import { generatePlan } from '@/lib/plan';

export const metadata: Metadata = { title: 'JS Ecosystem\'e taşı' };
export const dynamic = 'force-dynamic';

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access();
  if (!a.ok) return null;
  const p = await a.store.getProject(a.actor.orgId, id);
  if (!p) notFound();
  const run = await a.store.latestRun(a.actor.orgId, id);
  if (!run || run.status !== 'done') return <Empty>Taşıma planı için önce analiz tamamlanmalı. <Link className="text-button" href={`/projeler/${id}`}>Genel duruma git</Link></Empty>;
  const findings = await a.store.listFindings(a.actor.orgId, id);
  const flow = findings[0]?.body ?? null;
  const { markdown, effort, slug } = generatePlan({ project: p, flow, digest: run.digest, generatedAt: new Date().toISOString() });
  return (
    <div className="stack-y">
      <section className="card grid gap-3" aria-labelledby="pl-h">
        <h2 id="pl-h" className="h2">Taşıma planı</h2>
        <p className="sub">Bulgulardan türetilen, JS Ecosystem&apos;e uyarlanmış plan: modül, veri modeli, ekranlar, API, riskler ve efor. Kopyala ya da .md olarak indir; ana uygulamaya otomatik gönderilmez.</p>
        {!flow && <div className="callout warn"><b>AI sentez yok.</b> Plan şimdilik yalnızca ham kanıttan çıkarıldı. <Link className="text-button" href={`/projeler/${id}/bulgular`}>Bulgular sayfasında sentez çalıştır</Link>, plan somutlaşsın.</div>}
        <div className="stat-grid">
          <div className="stat"><b>~{effort.days} gün</b><span>tahmini efor ({effort.min}–{effort.max})</span></div>
          <div className="stat"><b>{effort.size}</b><span>beden</span></div>
          <div className="stat"><b>{flow?.steps.length ?? 0}</b><span>çıkarılan adım</span></div>
        </div>
        <PlanActions markdown={markdown} filename={`tasima-plani-${slug}.md`} />
      </section>
      <article className="plan-doc" tabIndex={0} aria-label="Taşıma planı (markdown)">{markdown}</article>
    </div>
  );
}
