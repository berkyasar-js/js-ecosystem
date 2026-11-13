'use client';
import { useEffect, useState } from 'react';
import type { Brand, Project } from '@jscore/contracts';
import { useSession } from './session';
import { useAct } from './mod';

/** Hızlı marka + proje oluşturma (Projeler sayfası ve kurulum 5. adımı). Marka yoksa önce marka açılır. */
export function QuickCreate({ brands, onCreated, autoOpen = false, compact = false }: { brands: Brand[]; onCreated?: (p: Project | null, b: Brand | null) => void; autoOpen?: boolean; compact?: boolean }) {
  const { repo, me, bump } = useSession();
  const { act, busy, Err } = useAct();
  const [open, setOpen] = useState(autoOpen);
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [newBrand, setNewBrand] = useState(brands.length === 0);
  useEffect(() => { if (!brandId && brands[0]) setBrandId(brands[0].id); }, [brands, brandId]);
  const canBrand = !!me && ['owner', 'org_admin', 'operations', 'account'].includes(me.role);
  const canProject = !!me && ['owner', 'org_admin', 'operations', 'account', 'pm'].includes(me.role);
  if (!canProject) return null;
  if (!open && !compact) return <button className="btn btn-primary" onClick={() => setOpen(true)}>Yeni proje</button>;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let brand: Brand | null = brands.find((b) => b.id === brandId) ?? null;
    const ok = await act(async () => {
      if (newBrand && canBrand) brand = await repo!.createBrand({ name: String(f.get('brand_name')), sector: String(f.get('sector') ?? '') });
      if (!brand) throw new Error('Önce bir marka seç ya da oluştur');
      const p = await repo!.createProject({ brand_id: brand.id, name: String(f.get('name')), type: String(f.get('type') || 'kampanya'), due_at: String(f.get('due_at') || '') || null, summary: String(f.get('summary') ?? '') });
      onCreated?.(p, brand);
    });
    if (ok) { setOpen(false); bump(); }
  };
  return (
    <form className="card grid gap-3" onSubmit={submit} aria-label="Hızlı proje oluştur">
      {Err}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Marka</label>
          <div className="flex flex-wrap items-center gap-2">
            {!newBrand && <select className="input w-auto" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Marka seç">{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
            {newBrand && <><input name="brand_name" className="input w-auto" placeholder="Marka adı" required minLength={2} /><input name="sector" className="input w-auto" placeholder="Sektör" /></>}
            {canBrand && <button type="button" className="btn btn-sm" onClick={() => setNewBrand((v) => !v)}>{newBrand ? 'Var olan markayı seç' : 'Yeni marka'}</button>}
          </div>
        </div>
        <div className="sm:col-span-2"><label className="label" htmlFor="qc-name">Proje adı</label><input id="qc-name" name="name" className="input" required minLength={2} placeholder="Örn. Lansman kampanyası" /></div>
        <div><label className="label" htmlFor="qc-type">Tür</label><input id="qc-type" name="type" className="input" defaultValue="kampanya" /></div>
        <div><label className="label" htmlFor="qc-due">Teslim</label><input id="qc-due" name="due_at" type="date" className="input" /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="qc-sum">Özet</label><input id="qc-sum" name="summary" className="input" maxLength={500} /></div>
      </div>
      <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>Oluştur</button>{!compact && <button type="button" className="btn" onClick={() => setOpen(false)}>Vazgeç</button>}</div>
    </form>
  );
}
