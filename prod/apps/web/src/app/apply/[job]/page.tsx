'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { applySchema } from '@jscore/contracts';

export default function Apply() {
  const { job } = useParams<{ job: string }>();
  const [errors, setErrors] = useState<string[]>([]);
  const [ok, setOk] = useState(false);
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = applySchema.safeParse({ name: f.get('name'), email: f.get('email'), portfolio: f.get('portfolio') ?? '', note: f.get('note') ?? '', consent: f.get('consent') === 'on' });
    if (!r.success) { setErrors(r.error.issues.map((i) => i.message)); return; }
    setErrors([]); setOk(true);
  };
  const title = decodeURIComponent(job).replace(/-/g, ' ');
  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center p-6">
      <h1 className="text-2xl font-extrabold">Başvuru · <span className="capitalize">{title}</span></h1>
      {ok ? <p role="status" className="card mt-5">Teşekkürler! Başvurun alındı (demo: JS Hire modülü üretimde bağlanacak).</p> : (
        <form onSubmit={submit} className="card mt-5 grid gap-4" noValidate>
          <div><label className="label" htmlFor="name">Ad soyad</label><input id="name" name="name" className="input" required /></div>
          <div><label className="label" htmlFor="email">E-posta</label><input id="email" name="email" type="email" className="input" required /></div>
          <div><label className="label" htmlFor="pf">Portfolyo (URL)</label><input id="pf" name="portfolio" className="input" placeholder="https://" /></div>
          <div><label className="label" htmlFor="note">Not</label><textarea id="note" name="note" className="input min-h-24" /></div>
          <label className="flex items-start gap-2 text-sm"><input name="consent" type="checkbox" className="mt-1" /> Kişisel verilerimin başvuru süreci için işlenmesine (KVKK) açık rıza veriyorum.</label>
          {errors.length > 0 && <ul role="alert" className="text-sm text-magenta">{errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          <button className="btn btn-primary">Başvuruyu gönder</button>
        </form>
      )}
    </main>
  );
}
