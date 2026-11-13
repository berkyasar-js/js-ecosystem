'use client';
import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { ROLES, ROLE_LABELS, audienceLabel, audienceMatches, canWriteColl, pendingAnnouncements, type Announcement, type AnnouncementAck, type AnnouncementAudience, type Project, type ProjectMember, type TeamMember } from '@jscore/contracts';
import { OrbitDialog } from './dialog';
import { MdLite } from './work/md-lite';
import { Card, Chip, ModulePage, useAct } from './mod';
import { useSession } from './session';
import { useToast } from './toasts';
import { Empty, fmtTime, useData } from './ui';

function useAnnouncements() {
  const { me, rev } = useSession();
  return useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [list, acks, team, projects, members] = await Promise.all([safe(r.list('announcements')), safe(r.list('announcement_acks')), safe(r.team()), safe(r.listProjects()), safe(r.list('project_members'))]);
    const mine = team.find((t) => t.id === me?.employee_id);
    const viewer = { role: me?.role ?? 'client_viewer', team: mine?.team ?? null, employee_id: me?.employee_id ?? null, project_ids: (members as ProjectMember[]).filter((m) => m.employee_id === me?.employee_id).map((m) => m.project_id) } as const;
    return { list: list as Announcement[], acks: acks as AnnouncementAck[], team, projects, viewer };
  }, [me?.id, rev]);
}

/** Ana Sayfa bandı: hedef kitlemde olup henüz onaylamadığım duyurular (okundu onayı ya da anket yanıtı); onaylanınca düşer. */
export function AnnouncementBanner() {
  const { me, repo, bump } = useSession();
  const q = useAnnouncements();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!me || !q.data) return null;
  const pending = pendingAnnouncements(q.data.list, q.data.acks, me.id, q.data.viewer);
  if (!pending.length) return null;
  const ack = async (a: Announcement, answer: string | null) => {
    if (!repo) return;
    setBusy(a.id);
    try { await repo.save('announcement_acks', { announcement_id: a.id, user_id: me.id, user_name: me.name, answer, at: new Date().toISOString() }); toast.success(answer ? 'Yanıtın kaydedildi' : 'Okundu olarak işaretlendi', a.title); bump(); }
    catch { /* yetki */ } finally { setBusy(null); }
  };
  return (
    <section className="card" aria-label="Duyurular" style={{ gridColumn: 'span 12' }}>
      {pending.slice(0, 3).map((a) => (
        <div key={a.id} className="flex flex-wrap items-start gap-3 border-b border-line py-3 last:border-b-0 first:pt-0 last:pb-0">
          <span className="signal-icon"><Megaphone size={16} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><strong>{a.title}</strong><span className="text-xs text-muted">{a.author_name} · {fmtTime(a.created_at)}</span>{a.requires_ack && <Chip tone="warn">Onay gerekli</Chip>}</div>
            <div className="mt-1 text-sm wk-x-md"><MdLite text={a.body} /></div>
            {a.poll && <p className="mt-2 text-sm font-semibold">{a.poll.question}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {a.poll ? a.poll.options.map((o) => <button key={o} className="btn btn-sm" disabled={busy === a.id} onClick={() => void ack(a, o)}>{o}</button>)
              : <button className="btn btn-sm btn-primary" disabled={busy === a.id} onClick={() => void ack(a, null)}>{a.requires_ack ? 'Okudum, onaylıyorum' : 'Tamam'}</button>}
          </div>
        </div>
      ))}
      {pending.length > 3 && <p className="mt-2 text-xs text-muted">+{pending.length - 3} duyuru daha · <Link className="underline" href="/app/announcements">Duyurular</Link></p>}
    </section>
  );
}

/** Duyurular sayfası: akış (hedef kitleme göre), okundu/anket sayımları (yazarlar ve yöneticiler), yeni duyuru (owner/org_admin/operasyon/İK). */
export function AnnouncementsView({ tab }: { tab?: string }) {
  const { me, repo, bump } = useSession();
  const q = useAnnouncements();
  const { act, busy, Err } = useAct();
  const [compose, setCompose] = useState<{ title: string } | null>(null);
  useEffect(() => { const sp = new URLSearchParams(window.location.search); if (sp.get('new') === '1') setCompose({ title: sp.get('title') ?? '' }); }, []);
  const canWrite = !!me && canWriteColl(me.role, 'announcements');
  const manager = !!me && ['owner', 'org_admin', 'operations', 'hr', 'account', 'pm'].includes(me.role);
  return (
    <ModulePage id="announcements" title="Duyurular" sub="Ekip duyuruları, okundu onayı ve kısa anketler" tabs={[['feed', 'Akış'], ...(manager ? [['stats', 'Onay & anket sayımları'] as [string, string]] : [])]} tab={tab}
      actions={canWrite ? <button className="btn btn-primary btn-sm" onClick={() => setCompose({ title: '' })}><Plus size={14} aria-hidden /> Yeni duyuru</button> : undefined}>
      {(t) => {
        if (!q.data || !me) return <p className="text-sm text-muted">Yükleniyor…</p>;
        const { list, acks, team, projects, viewer } = q.data;
        const visible = list.filter((a) => audienceMatches(a.audience, viewer) || a.author_user_id === me.id || manager).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const myAck = (id: string) => acks.find((x) => x.announcement_id === id && x.user_id === me.id);
        const ack = (a: Announcement, answer: string | null) => void act(() => repo!.save('announcement_acks', { announcement_id: a.id, user_id: me.id, user_name: me.name, answer, at: new Date().toISOString() }));
        if (t === 'stats') {
          const audienceSize = (a: Announcement) => team.filter((m) => m.status === 'active' && audienceMatches(a.audience, { role: m.app_role, team: m.team ?? null, employee_id: m.id })).length;
          return (
            <div className="grid gap-4">{Err}
              {visible.length === 0 ? <Empty>Duyuru yok.</Empty> : visible.map((a) => {
                const mine = acks.filter((x) => x.announcement_id === a.id); const size = audienceSize(a) || 1;
                return (
                  <Card key={a.id} title={a.title} aside={<span className="flex gap-2"><Chip>{audienceLabel(a.audience)}</Chip>{a.requires_ack && <Chip tone={mine.length >= size ? 'ok' : 'warn'}>{mine.length}/{size} onayladı</Chip>}</span>}>
                    {a.poll ? (
                      <ul className="grid gap-2">{a.poll.options.map((o) => { const n = mine.filter((x) => x.answer === o).length; return <li key={o} className="flex items-center gap-3 text-sm"><span className="w-32 truncate">{o}</span><div className="h-2 flex-1 rounded-full bg-nested"><div className="h-2 rounded-full bg-accent" style={{ width: `${mine.length ? (n / mine.length) * 100 : 0}%` }} /></div><span className="w-10 text-right text-xs text-muted">{n}</span></li>; })}</ul>
                    ) : <p className="text-sm text-muted">{mine.length ? `Onaylayanlar: ${mine.map((x) => x.user_name).join(', ')}` : 'Henüz onaylayan yok.'}</p>}
                    {(a.author_user_id === me.id || me.role === 'owner' || me.role === 'org_admin') && <button className="btn btn-ghost btn-sm mt-3" disabled={busy} onClick={() => { if (window.confirm('Duyuru silinsin mi?')) void act(() => repo!.remove('announcements', a.id)); }}>Sil</button>}
                  </Card>
                );
              })}
            </div>
          );
        }
        return (
          <div className="grid gap-4">{Err}
            {visible.length === 0 ? <Empty>Henüz duyuru yok.</Empty> : visible.map((a) => { const k = myAck(a.id); return (
              <article key={a.id} className="card">
                <div className="flex flex-wrap items-center gap-2"><Megaphone size={16} aria-hidden /><h2 className="font-bold">{a.title}</h2><span className="text-xs text-muted">{a.author_name} · {fmtTime(a.created_at)}</span><Chip>{audienceLabel(a.audience)}</Chip>{a.requires_ack && <Chip tone={k ? 'ok' : 'warn'}>{k ? 'Onayladın' : 'Onay gerekli'}</Chip>}</div>
                <div className="mt-2 text-sm wk-x-md"><MdLite text={a.body} /></div>
                {a.poll && <div className="mt-3"><p className="text-sm font-semibold">{a.poll.question}</p><div className="mt-2 flex flex-wrap gap-2">{a.poll.options.map((o) => <button key={o} className={`btn btn-sm ${k?.answer === o ? 'btn-primary' : ''}`} aria-pressed={k?.answer === o} disabled={busy} onClick={() => ack(a, o)}>{o}</button>)}</div>{k?.answer && <p className="mt-1 text-xs text-muted">Yanıtın: {k.answer}</p>}</div>}
                {!a.poll && !k && <button className="btn btn-sm btn-primary mt-3" disabled={busy} onClick={() => ack(a, null)}>{a.requires_ack ? 'Okudum, onaylıyorum' : 'Tamam'}</button>}
              </article>
            ); })}
            <ComposeDialog open={!!compose} initialTitle={compose?.title ?? ''} onClose={() => setCompose(null)} team={team} projects={projects} onSaved={bump} />
          </div>
        );
      }}
    </ModulePage>
  );
}

export function ComposeDialog({ open, onClose, team, projects, initialTitle = '', onSaved }: { open: boolean; onClose: () => void; team: TeamMember[]; projects: Project[]; initialTitle?: string; onSaved?: () => void }) {
  const { repo, me } = useSession();
  const toast = useToast();
  const id = useId();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'all' | 'teams' | 'roles' | 'projects'>('all');
  const [teams, setTeams] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [projs, setProjs] = useState<string[]>([]);
  const [requiresAck, setRequiresAck] = useState(true);
  const [pollOn, setPollOn] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState('Evet, Hayır');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const teamNames = useMemo(() => [...new Set(team.map((t) => t.team).filter((x): x is string => !!x))].sort(), [team]);
  useEffect(() => { if (open) { setTitle(initialTitle); setBody(''); setMode('all'); setTeams([]); setRoles([]); setProjs([]); setRequiresAck(true); setPollOn(false); setPollQ(''); setErr(null); } }, [open, initialTitle]);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !me || busy) return;
    if (title.trim().length < 2) { setErr('Başlık gerekli.'); return; }
    const audience: AnnouncementAudience = mode === 'all' ? { all: true } : mode === 'teams' ? { teams } : mode === 'roles' ? { roles } : { project_ids: projs };
    const options = pollOpts.split(',').map((x) => x.trim()).filter(Boolean);
    if (pollOn && (pollQ.trim().length < 2 || options.length < 2)) { setErr('Anket için soru ve en az 2 seçenek gerekli.'); return; }
    setBusy(true); setErr(null);
    try {
      await repo.save('announcements', { author_user_id: me.id, author_name: me.name, title: title.trim(), body: body.trim(), audience, requires_ack: requiresAck && !pollOn, poll: pollOn ? { question: pollQ.trim(), options: options.slice(0, 6) } : null });
      toast.success('Duyuru yayımlandı', title.trim()); onSaved?.(); onClose();
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Yayımlanamadı'); } finally { setBusy(false); }
  };
  return (
    <OrbitDialog open={open} onClose={() => !busy && onClose()} title="Yeni duyuru" description="Hedef kitledeki herkesin Ana Sayfa'sında onaylanana dek bant olarak görünür.">
      <form onSubmit={submit} noValidate aria-busy={busy}>
        <div className="wk-dialog-body">
          <div><label className="wk-label" htmlFor={`${id}-t`}>Başlık *</label><input id={`${id}-t`} className="wk-field" autoFocus maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="wk-label" htmlFor={`${id}-b`}>Metin (markdown-lite)</label><textarea id={`${id}-b`} className="wk-field wk-x-ta" rows={5} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <fieldset className="wk-x-fieldset"><legend>Hedef kitle</legend>
            <div className="wk-chips">{([['all', 'Herkes'], ['teams', 'Ekipler'], ['roles', 'Roller'], ['projects', 'Projeler']] as const).map(([k, l]) => <button key={k} type="button" className="wk-chip" data-on={mode === k || undefined} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
            {mode === 'teams' && <div className="wk-chips" style={{ marginTop: 8 }}>{teamNames.length === 0 ? <span className="wk-muted">Ekip tanımlı değil.</span> : teamNames.map((t) => <button key={t} type="button" className="wk-chip" data-on={teams.includes(t) || undefined} aria-pressed={teams.includes(t)} onClick={() => toggle(teams, setTeams, t)}>{t}</button>)}</div>}
            {mode === 'roles' && <div className="wk-chips" style={{ marginTop: 8 }}>{ROLES.filter((r) => !r.startsWith('client')).map((r) => <button key={r} type="button" className="wk-chip" data-on={roles.includes(r) || undefined} aria-pressed={roles.includes(r)} onClick={() => toggle(roles, setRoles, r)}>{ROLE_LABELS[r]}</button>)}</div>}
            {mode === 'projects' && <div className="wk-chips" style={{ marginTop: 8 }}>{projects.filter((p) => p.status !== 'done').map((p) => <button key={p.id} type="button" className="wk-chip" data-on={projs.includes(p.id) || undefined} aria-pressed={projs.includes(p.id)} onClick={() => toggle(projs, setProjs, p.id)}>{p.name}</button>)}</div>}
          </fieldset>
          <label className="wk-check"><input type="checkbox" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} /> Anket ekle</label>
          {pollOn ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label className="wk-label" htmlFor={`${id}-pq`}>Soru</label><input id={`${id}-pq`} className="wk-field" maxLength={200} value={pollQ} onChange={(e) => setPollQ(e.target.value)} /></div>
              <div><label className="wk-label" htmlFor={`${id}-po`}>Seçenekler (virgülle, en çok 6)</label><input id={`${id}-po`} className="wk-field" value={pollOpts} onChange={(e) => setPollOpts(e.target.value)} /></div>
            </div>
          ) : <label className="wk-check"><input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} /> Okundu onayı iste</label>}
          {err && <p role="alert" className="wk-error">{err}</p>}
        </div>
        <div className="wk-dialog-actions"><button type="button" className="wk-btn" onClick={onClose} disabled={busy}>Vazgeç</button><button type="submit" className="wk-btn" data-primary disabled={busy}>{busy ? 'Yayımlanıyor…' : 'Yayımla'}</button></div>
      </form>
    </OrbitDialog>
  );
}
