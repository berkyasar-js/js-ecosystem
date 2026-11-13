'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ROLE_LABELS, workloadRows, type Brand, type Project, type Task, type TeamMember } from '@jscore/contracts';
import { Avatar } from '../avatar';
import { Bar, Card, Chip, toneOf } from '../mod';
import { PresenceDot, usePresence } from '../presence';
import { Empty, fmtDate } from '../ui';
import { isOverdue } from '../work/work-utils';

/** Ekip → Kişiler → Rehber (0017): kartlar (unvan, ekip, yönetici, rol, çevrimiçi), arama ve ekip süzgeci; kart → profil. */
export function Directory({ team, tasks, today }: { team: TeamMember[]; tasks: Task[]; today: string }) {
  const online = usePresence();
  const [q, setQ] = useState('');
  const [teamF, setTeamF] = useState('');
  const teams = useMemo(() => [...new Set(team.map((t) => t.team).filter((x): x is string => !!x))].sort(), [team]);
  const rows = workloadRows(tasks, team, today);
  const t = q.trim().toLocaleLowerCase('tr');
  const shown = team.filter((m) => m.status === 'active' && (!teamF || m.team === teamF) && (!t || m.name.toLocaleLowerCase('tr').includes(t) || m.role_title.toLocaleLowerCase('tr').includes(t)))
    .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name, 'tr'));
  const name = (id: string | null | undefined) => team.find((m) => m.id === id)?.name;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-auto" type="search" placeholder="Ad ya da unvan…" aria-label="Kişi ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" aria-label="Ekip" value={teamF} onChange={(e) => setTeamF(e.target.value)}><option value="">Tüm ekipler</option>{teams.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <Chip tone="ok">{team.filter((m) => m.status === 'active' && online.has(m.id)).length} çevrimiçi</Chip><Chip>{shown.length} kişi</Chip>
      </div>
      {shown.length === 0 ? <Empty>Eşleşen kişi yok.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => { const w = rows.find((r) => r.member.id === m.id); return (
            <Link key={m.id} href={`/app/people/${m.id}?tab=profile`} className="card flex gap-3 hover:border-accent">
              <Avatar id={m.id} name={m.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2"><strong className="truncate">{m.name}</strong><PresenceDot online={online.has(m.id)} label={false} /></div>
                <div className="truncate text-sm text-muted">{m.role_title || ROLE_LABELS[m.app_role]}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted">{m.team && <Chip>{m.team}</Chip>}<Chip>{ROLE_LABELS[m.app_role]}</Chip>{m.manager_id && <span className="self-center">Yönetici: {name(m.manager_id)?.split(' ')[0]}</span>}</div>
                {w && w.open > 0 && <div className="mt-2 flex items-center gap-2 text-xs"><div className="w-24"><Bar pct={Math.min(w.pct, 150)} tone={toneOf(w.pct)} /></div><span className="text-muted">%{w.pct} · {w.open} açık{w.overdue ? ` · ${w.overdue} gecikmiş` : ''}</span></div>}
              </div>
            </Link>
          ); })}
        </div>
      )}
    </div>
  );
}

/** Profil kartı ekleri (Çalışan 360 → Profil): çevrimiçi durumu, bu hafta yük, açık görevler ve sorumlu olduğu markalar. */
export function ProfileWork({ member, team, tasks, projects, brands, today }: { member: TeamMember; team: TeamMember[]; tasks: Task[]; projects: Project[]; brands: Brand[]; today: string }) {
  const online = usePresence();
  const w = workloadRows(tasks, [member], today)[0];
  const mine = tasks.filter((t) => t.assignee_id === member.id && t.state !== 'archive' && t.state !== 'delivery').sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'));
  const myBrands = brands.filter((b) => b.default_assignee_id === member.id || b.account_owner === member.id || b.art_director === member.id);
  const reports = team.filter((t) => t.manager_id === member.id && t.status === 'active');
  return (
    <div className="grid gap-4">
      <Card title="Durum ve yük" aside={<PresenceDot online={online.has(member.id)} />}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="nested"><div className="text-xs text-muted">Bu hafta</div><div className="text-2xl font-bold">%{w?.pct ?? 0}</div><div className="mt-1"><Bar pct={Math.min(w?.pct ?? 0, 150)} tone={toneOf(w?.pct ?? 0)} /></div><div className="mt-1 text-xs text-muted">{Math.round((w?.planned_min ?? 0) / 60)} / {Math.round((w?.capacity_min ?? 0) / 60)} sa</div></div>
          <div className="nested"><div className="text-xs text-muted">Açık görev</div><div className="text-2xl font-bold">{mine.length}</div><div className="text-xs text-muted">{w?.overdue ?? 0} gecikmiş</div></div>
          <div className="nested"><div className="text-xs text-muted">Ekip</div><div className="font-semibold">{member.team ?? '—'}</div><div className="text-xs text-muted">Yönetici: {team.find((t) => t.id === member.manager_id)?.name ?? '—'}{reports.length ? ` · ${reports.length} bağlı kişi` : ''}</div></div>
        </div>
      </Card>
      <Card title="Açık görevler">{mine.length === 0 ? <Empty>Açık görev yok.</Empty> : <ul className="home-list">{mine.slice(0, 10).map((t) => <li key={t.id}><Link href={`/app/projects/${t.project_id}?task=${t.id}`} className="home-row"><span className="min-w-0 flex-1 truncate"><span className="font-semibold">{t.title}</span><span className="ml-2 text-xs text-muted">{projects.find((p) => p.id === t.project_id)?.name}</span></span><span className={`chip ${isOverdue(t, today) ? 'chip-bad' : ''}`}>{fmtDate(t.due_at)}</span></Link></li>)}</ul>}</Card>
      <Card title="Markalar (alan sahibi / hesap / AD)">{myBrands.length === 0 ? <Empty>Bağlı marka yok.</Empty> : <div className="flex flex-wrap gap-2">{myBrands.map((b) => <Link key={b.id} href={`/app/crm/${b.id}`} className="chip chip-brand">{b.name}{b.default_assignee_id === member.id ? ' · alan sahibi' : ''}</Link>)}</div>}</Card>
    </div>
  );
}
