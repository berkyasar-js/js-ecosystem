'use client';
import { useEffect, useRef, useState } from 'react';
import type { Message } from '@jscore/contracts';
import { Async, Empty, PageHeader, fmtTime, useData } from '@/components/ui';
import { useSession } from '@/components/session';
import { DEMO_STORAGE_KEY } from '@jscore/core/repo/demo';

export default function Messages() {
  const { repo, mode } = useSession();
  const chans = useData((r) => r.listChannels());
  const [ch, setCh] = useState<string | null>(null);
  const active = ch ?? chans.data?.[0]?.id ?? null;
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!repo || !active) return;
    let alive = true;
    repo.listMessages(active).then((m) => alive && setMsgs(m), (e: Error) => alive && setErr(e.message));
    const off = repo.subscribeMessages(active, (m) => setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])));
    return () => { alive = false; off(); };
  }, [repo, active]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  // Realtime yedeği: demo'da (BroadcastChannel yok) diğer sekmelerden gelen yazımlar için localStorage'ı yokla;
  // Supabase'de kanal bağlantısı düşerse 15 sn'de bir yeniden çek.
  useEffect(() => {
    if (!repo || !active) return;
    let alive = true;
    const pull = () => repo.listMessages(active).then((m) => alive && setMsgs((cur) => (m.length === cur.length && m.at(-1)?.id === cur.at(-1)?.id ? cur : m)), () => undefined);
    const timer = setInterval(pull, mode === 'demo' ? 3000 : 15000);
    const onStorage = (e: StorageEvent) => { if (e.key === DEMO_STORAGE_KEY) void pull(); };
    if (mode === 'demo') window.addEventListener('storage', onStorage);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('storage', onStorage); };
  }, [repo, active, mode]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repo || !active || !text.trim()) return;
    try {
      const m = await repo.sendMessage(active, text);
      setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      setText(''); setErr(null);
    } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Gönderilemedi'); }
  };

  return (
    <>
      <PageHeader title="Mesajlar" sub={mode === 'supabase' ? 'Canlı (Supabase Realtime + yoklama yedeği)' : 'Demo — yerel kanallar, 3 sn yoklama'} />
      <Async q={chans}>{(list) => list.length === 0 ? <Empty>Erişebildiğin kanal yok.</Empty> : (
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <ul className="card grid content-start gap-1 p-2" aria-label="Kanallar">
            {list.map((c) => <li key={c.id}><button className="navitem w-full" aria-current={c.id === active ? 'page' : undefined} onClick={() => { setCh(c.id); setMsgs([]); }}># {c.name}</button></li>)}
          </ul>
          <section className="card flex h-[60vh] flex-col">
            <div className="flex-1 overflow-y-auto pr-1" aria-live="polite">
              {msgs.length === 0 && <p className="text-sm text-muted">Henüz mesaj yok.</p>}
              {msgs.map((m) => <div key={m.id} className="mb-3"><div className="text-xs text-muted"><strong className="text-ink">{m.author_name}</strong> · {fmtTime(m.created_at)}</div><div className="text-sm">{m.body}</div></div>)}
              <div ref={end} />
            </div>
            {err && <p role="alert" className="text-sm text-magenta">{err}</p>}
            <form onSubmit={send} className="mt-3 flex gap-2"><input className="input" aria-label="Mesaj" placeholder="Mesaj yaz…" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn btn-primary">Gönder</button></form>
          </section>
        </div>
      )}</Async>
    </>
  );
}
