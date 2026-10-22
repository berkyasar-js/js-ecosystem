'use client';
import { PRODUCTS, moduleEntitled, type OrgSettings } from '@jscore/contracts';
import { fmtTime, money, useData } from '../ui';
import { useSession } from '../session';
import { Await, Card, Chip, FormCard, Grid, Metric, ModulePage, Table, useAct } from '../mod';

const TABS: Array<[string, string]> = [['catalog', 'Ürün kataloğu'], ['subscription', 'Abonelik'], ['usage', 'Kullanım'], ['billing', 'Faturalama'], ['packs', 'Sektör paketleri'], ['whitelabel', 'White label'], ['tenant', 'Tenant ayarları']];
const PACKS: Array<[string, string, string]> = [['agency', 'Ajans', 'Brief, kota, retainer akışları'], ['events', 'Etkinlik', 'Run-of-show, tedarikçi, saha'], ['production', 'Prodüksiyon', 'Çekim planı, ekipman, post-prodüksiyon'], ['b2b', 'B2B hizmet', 'Teklif, sözleşme, yenileme']];
const DEFAULT_PLAN = { name: 'Business', seats: 12, period: 'monthly' as const };

export function MarketplaceView({ tab }: { tab?: string }) {
  const { repo, me } = useSession();
  const q = useData(async (r) => ({ s: await r.getSettings(), runs: await r.listAgentRuns().catch(() => []), media: await r.list('media_assets').catch(() => []), members: await r.listMembers().catch(() => []) }));
  const { act, busy, Err } = useAct();
  const admin = me?.role === 'owner' || me?.role === 'org_admin';
  const save = (patch: Partial<OrgSettings>) => act(() => repo!.saveSettings(patch));
  return (
    <ModulePage id="marketplace" title="Ürünler & Paketler" sub="Entitlement değişiklikleri menüye anında yansır" tabs={TABS} tab={tab}>
      {(t) => <Await q={q}>{({ s, runs, media, members }) => {
        const flags = s.feature_flags ?? {}; const plan = s.plan ?? DEFAULT_PLAN; const on = PRODUCTS.filter((p) => flags[p.id] !== false);
        const monthly = on.reduce((a, p) => a + p.price_minor, 0) * 1; const total = plan.period === 'yearly' ? Math.round(monthly * 12 * 0.8) : monthly;
        const note = !admin && <p className="mb-3 text-xs text-muted" role="note">Değişiklik yetkisi yalnızca Owner / Org Admin’dedir.</p>;
        if (t === 'catalog') return (
          <div className="grid gap-4">{Err}{note}
            <Grid cols={3}>{PRODUCTS.map((p) => { const enabled = flags[p.id] !== false; return (
              <Card key={p.id} title={p.name} aside={<Chip tone={enabled ? 'ok' : undefined}>{enabled ? 'Açık' : 'Kapalı'}</Chip>}>
                <p className="text-sm text-muted">{p.desc}</p><p className="mt-1 text-xs text-muted">{p.group} · {money(p.price_minor)}/ay</p>
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={enabled} disabled={!admin || busy} onChange={() => void save({ feature_flags: { ...flags, [p.id]: !enabled } })} /> {enabled ? 'Menüde görünür' : 'Menüden gizli'}</label>
              </Card>); })}</Grid>
          </div>
        );
        if (t === 'subscription') return (
          <div className="grid max-w-2xl gap-4">{Err}{note}
            <Card title="Mevcut plan"><p className="text-2xl font-bold">{plan.name}</p><p className="text-sm text-muted">{plan.seats} koltuk · {plan.period === 'yearly' ? 'yıllık (%20 indirim)' : 'aylık'} · {on.length} ürün açık</p></Card>
            {admin && <FormCard title="Planı değiştir" busy={busy} fields={[{ name: 'name', label: 'Plan', type: 'select', options: [['Starter', 'Starter'], ['Business', 'Business'], ['Enterprise', 'Enterprise']], def: plan.name }, { name: 'seats', label: 'Koltuk', type: 'number', def: plan.seats }, { name: 'period', label: 'Dönem', type: 'select', options: [['monthly', 'Aylık'], ['yearly', 'Yıllık']], def: plan.period }]}
              onSubmit={(v) => save({ plan: { name: String(v.name), seats: Math.max(1, Math.round(Number(v.seats))), period: String(v.period) as 'monthly' } })} />}
          </div>
        );
        if (t === 'usage') return (
          <Grid cols={3}>
            <Metric label="Koltuk" value={`${members.length || 1}/${plan.seats}`} def="Aktif üye sayısı / plandaki koltuk." />
            <Metric label="Ajan çağrısı" value={runs.length} def="Kayıtlı ajan çalıştırması sayısı." hint={`$${runs.reduce((a, r) => a + r.cost_usd, 0).toFixed(2)} maliyet`} />
            <Metric label="Depolama" value={`${(media.reduce((a, m) => a + m.size_mb, 0) / 1000).toFixed(1)} GB`} def="Medya kütüphanesindeki toplam dosya boyutu." />
          </Grid>
        );
        if (t === 'billing') return (
          <div className="grid max-w-2xl gap-4">
            <Card title={plan.period === 'yearly' ? 'Yıllık tutar' : 'Aylık tutar'}><p className="text-3xl font-bold">{money(total)}</p><p className="text-xs text-muted">{on.length} açık ürünün toplamı{plan.period === 'yearly' ? ' × 12, %20 indirimli' : ''}. Kapalı ürünler faturaya yansımaz.</p></Card>
            <Card title="Kalemler"><Table heads={['Ürün', 'Aylık']}>{on.map((p) => <tr key={p.id}><td>{p.name}</td><td>{money(p.price_minor)}</td></tr>)}</Table></Card>
            <Card title="Geçmiş dönemler">{['2026-09', '2026-08'].map((m) => <p key={m} className="text-sm">{m} · {money(monthly)} <Chip tone="ok">ödendi</Chip></p>)}<p className="mt-2 text-xs text-muted">Üretimde e-fatura entegrasyonuyla (JS Connect) gelir.</p></Card>
          </div>
        );
        if (t === 'packs') {
          const sel = s.industry_packs ?? ['agency'];
          return <div className="grid gap-4">{Err}{note}<Grid cols={2}>{PACKS.map(([id, n, d]) => <Card key={id} title={n} aside={<Chip tone={sel.includes(id) ? 'ok' : undefined}>{sel.includes(id) ? 'Kurulu' : 'Kurulu değil'}</Chip>}><p className="text-sm text-muted">{d}</p><button className="btn btn-sm mt-3" disabled={!admin || busy} onClick={() => void save({ industry_packs: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] })}>{sel.includes(id) ? 'Kaldır' : 'Kur'}</button></Card>)}</Grid></div>;
        }
        if (t === 'whitelabel') {
          const wl = s.white_label ?? { enabled: false, name: s.general.name, color: '#1b25e0', domain: '' };
          return <div className="grid max-w-2xl gap-4">{Err}{note}<Card title="Marka özelleştirme"><p className="text-sm">{wl.enabled ? 'White label açık' : 'White label kapalı'} · {wl.name} · {wl.domain || 'alan adı yok'} <span className="ml-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: wl.color }} /></p></Card>
            {admin && <FormCard title="White label ayarları" busy={busy} fields={[{ name: 'enabled', label: 'Etkin', type: 'checkbox', def: wl.enabled }, { name: 'name', label: 'Görünen ad', def: wl.name }, { name: 'color', label: 'Ana renk', def: wl.color }, { name: 'domain', label: 'Alan adı', def: wl.domain }]} onSubmit={(v) => save({ white_label: { enabled: !!v.enabled, name: String(v.name), color: String(v.color), domain: String(v.domain) } })} />}</div>;
        }
        return (
          <div className="grid max-w-2xl gap-4">{Err}{note}
            <Card title="Tenant"><dl className="grid gap-1 text-sm">{[['Organizasyon', s.general.name], ['Dil', s.general.locale], ['Saat dilimi', s.general.timezone], ['Para birimi', s.general.currency], ['MFA zorunlu', s.security.mfa_required ? 'Evet' : 'Hayır'], ['Menüde görünen ürün', `${PRODUCTS.filter((p) => moduleEntitled(p.id, flags)).length}/${PRODUCTS.length}`]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-line py-1"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}</dl></Card>
            {admin && <FormCard title="Tenant adı" busy={busy} fields={[{ name: 'name', label: 'Organizasyon adı', def: s.general.name, required: true }]} onSubmit={(v) => save({ general: { ...s.general, name: String(v.name) } })} />}
            <p className="text-xs text-muted">Son güncelleme: {fmtTime('2026-10-14T09:00:00Z')}. Güvenlik ve veri ayarları için Admin Control Center.</p>
          </div>
        );
      }}</Await>}
    </ModulePage>
  );
}
