'use client';
import { useMemo, useState } from 'react';
import { ROLES, ROLE_LABELS, audienceLabel, audienceMatches, type Announcement, type AnnouncementAck, type AnnouncementAudience } from '@jscore/contracts';
import { Msg, errText } from '@/components/admin-ui';
import { useSession } from '@/components/session';
import { Async, PageHeader, fmtTime, useData } from '@/components/ui';

/** Duyurular (0017, panel): yaz (hedef kitle: herkes / ekip / rol; okundu onayı; anket), okundu ve anket sayımları, sil. Veri: Repo `announcements` + `announcement_acks`. */
export default function AnnouncementsAdmin() {
  const { repo, me, rev, bump } = useSession();
  const q = useData(async (r) => {
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [list, acks, team] = await Promise.all([safe(r.list('announcements')), safe(r.list('announcement_acks')), safe(r.team())]);
    return { list: (list as Announcement[]).sort((a, b) => b.created_at.localeCompare(a.created_at)), acks: acks as AnnouncementAck[], team };
  }, [rev]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'all' | 'teams' | 'roles'>('all');
  const [teams, setTeams] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [requiresAck, setRequiresAck] = useState(true);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState('');
  const [busy, setBusy] = useState(false);
  const teamNames = useMemo(() => [...new Set((q.data?.team ?? []).map((t) => t.team).filter((x): x is string => !!x))].sort(), [q.data]);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !me || busy) return;
    const options = pollOpts.split(',').map((x) => x.trim()).filter(Boolean);
    if (title.trim().length < 2) { setMsg({ ok: false, text: 'Başlık gerekli.' }); return; }
    if (pollQ.trim() && options.length < 2) { setMsg({ ok: false, text: 'Anket için en az 2 seçenek gerekli.' }); return; }
    const audience: AnnouncementAudience = mode === 'all' ? { all: true } : mode === 'teams' ? { teams } : { roles };
    setBusy(true);
    try {
      await repo.save('announcements', { author_user_id: me.id, author_name: me.name, title: title.trim(), body: body.trim(), audience, requires_ack: requiresAck && !pollQ.trim(), poll: pollQ.trim() ? { question: pollQ.trim(), options: options.slice(0, 6) } : null });
      await repo.audit('admin.announcement.create', 'announcements', { title: title.trim(), audience });
      setTitle(''); setBody(''); setPollQ(''); setPollOpts(''); setMsg({ ok: true, text: 'Duyuru yayımlandı.' }); bump();
    } catch (ex) { setMsg({ ok: false, text: errText(ex) }); } finally { setBusy(false); }
  };
  const remove = async (a: Announcement) => { if (!repo || !window.confirm('Duyuru silinsin mi?')) return; try { await repo.remove('announcements', a.id); bump(); } catch (ex) { setMsg({ ok: false, text: errText(ex) }); } };
  return (
    <>
      <PageHeader title="Duyurular" sub="Ekibe duyuru yaz; okundu onayı ve anket sayımlarını izle. Kullanıcı uygulamasında Ana Sayfa bandı + Duyurular sayfası." />
      <Msg m={msg} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Async q={q}>{({ list, acks, team }) => {
          const size = (a: Announcement) => team.filter((m) => m.status === 'active' && audienceMatches(a.audience, { role: m.app_role, team: m.team ?? null, employee_id: m.id })).length || 1;
          return (
            <section className="grid gap-3">
              {list.length === 0 ? <div className="card text-sm text-muted">Henüz duyuru yok.</div> : list.map((a) => {
                const mine = acks.filter((x) => x.announcement_id === a.id);
                return (
                  <article key={a.id} className="card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2"><strong>{a.title}</strong><span className="chip">{audienceLabel(a.audience)}</span>{a.requires_ack && <span className={`chip ${mine.length >= size(a) ? 'chip-ok' : 'chip-warn'}`}>{mine.length}/{size(a)} onayladı</span>}{a.poll && <span className="chip chip-brand">Anket · {mine.length} yanıt</span>}</div>
                      <span className="text-xs text-muted">{a.author_name} · {fmtTime(a.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
                    {a.poll && <ul className="mt-3 grid gap-1">{a.poll.options.map((o) => { const n = mine.filter((x) => x.answer === o).length; return <li key={o} className="flex items-center gap-3 text-sm"><span className="w-32 truncate">{o}</span><div className="h-2 flex-1 rounded-full bg-nested"><div className="h-2 rounded-full bg-accent" style={{ width: `${mine.length ? (n / mine.length) * 100 : 0}%` }} /></div><span className="w-8 text-right text-xs text-muted">{n}</span></li>; })}</ul>}
                    {a.requires_ack && mine.length > 0 && <p className="mt-2 text-xs text-muted">Onaylayanlar: {mine.map((x) => x.user_name).join(', ')}</p>}
                    <button className="btn btn-ghost btn-sm mt-2" onClick={() => void remove(a)}>Sil</button>
                  </article>
                );
              })}
            </section>
          );
        }}</Async>
        <form className="card grid gap-3 self-start" onSubmit={publish} aria-busy={busy}>
          <h2 className="font-bold">Yeni duyuru</h2>
          <div><label className="label" htmlFor="an-t">Başlık</label><input id="an-t" className="input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="label" htmlFor="an-b">Metin (markdown-lite)</label><textarea id="an-b" className="input min-h-24" maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div><span className="label">Hedef kitle</span>
            <div className="flex flex-wrap gap-1">{([['all', 'Herkes'], ['teams', 'Ekipler'], ['roles', 'Roller']] as const).map(([k, l]) => <button key={k} type="button" className={`chip ${mode === k ? 'chip-brand' : ''}`} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
            {mode === 'teams' && <div className="mt-2 flex flex-wrap gap-1">{teamNames.length === 0 ? <span className="text-xs text-muted">Ekip tanımlı değil (Çalışanlar → Ekipler).</span> : teamNames.map((t) => <button key={t} type="button" className={`chip ${teams.includes(t) ? 'chip-ok' : ''}`} aria-pressed={teams.includes(t)} onClick={() => toggle(teams, setTeams, t)}>{t}</button>)}</div>}
            {mode === 'roles' && <div className="mt-2 flex flex-wrap gap-1">{ROLES.filter((r) => !r.startsWith('client')).map((r) => <button key={r} type="button" className={`chip ${roles.includes(r) ? 'chip-ok' : ''}`} aria-pressed={roles.includes(r)} onClick={() => toggle(roles, setRoles, r)}>{ROLE_LABELS[r]}</button>)}</div>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requiresAck} disabled={!!pollQ.trim()} onChange={(e) => setRequiresAck(e.target.checked)} /> Okundu onayı iste</label>
          <div><label className="label" htmlFor="an-pq">Anket sorusu (isteğe bağlı)</label><input id="an-pq" className="input" maxLength={200} value={pollQ} onChange={(e) => setPollQ(e.target.value)} /></div>
          {pollQ.trim() && <div><label className="label" htmlFor="an-po">Seçenekler (virgülle)</label><input id="an-po" className="input" value={pollOpts} placeholder="Evet, Hayır" onChange={(e) => setPollOpts(e.target.value)} /></div>}
          <button className="btn btn-primary w-fit" disabled={busy}>{busy ? 'Yayımlanıyor…' : 'Yayımla'}</button>
        </form>
      </div>
    </>
  );
}
