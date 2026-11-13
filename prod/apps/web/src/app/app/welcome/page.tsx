'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Check, Keyboard, Sparkles } from 'lucide-react';
import { ROLE_LABELS, type Role } from '@jscore/contracts';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/components/session';

/** Role göre "ilk 3 adım". */
const FIRST_STEPS: Partial<Record<Role, Array<[string, string, string]>>> & { default: Array<[string, string, string]> } = {
  owner: [['Çalışma alanını kur', 'Organizasyon, ekip, modüller ve entegrasyonlar — 10 dakika.', '/app/setup'], ['Ekibini davet et', 'Kurulum → Ekip adımında XLSX ile de içe aktarabilirsin.', '/app/setup?step=team'], ['İlk projeyi aç', 'Marka + proje; görevler oradan akar.', '/app/projects?new=1']],
  org_admin: [['Çalışma alanını kur', 'Organizasyon, ekip, modüller ve entegrasyonlar.', '/app/setup'], ['Gelen kutusunu tanı', 'Onaylar, anmalar ve teslimler tek kuyrukta.', '/app/inbox'], ['Uygulamaları keşfet', 'Favorilediklerin kenar çubuğuna gelir.', '/app/apps']],
  account: [['Müşterilerini gör', 'Markalar, fırsatlar ve sağlık skorları.', '/app/crm'], ['Projeleri tara', 'Akış aşamaları ve teslimler.', '/app/projects'], ['Bekleyen onaylar', 'Karar bekleyen kalemler gelen kutusunda.', '/app/inbox']],
  creative: [['Görevlerim', 'Bugünün planı ve odak modu.', '/app/mywork'], ['Üretim araçları', 'Studio, Social, Media, Review tek çatıda.', '/app/uretim'], ['⌘K ile her yere git', 'Görev, proje, marka, kişi — tek kutu.', '/app/overview']],
  client_admin: [['Portal', 'Açık işler, onaylar ve dosyalar.', '/app/portal'], ['Onaylar', 'Kararınızı bekleyen kalemler.', '/app/approvals'], ['Mesajlar', 'Proje konuşmaları.', '/app/messages']],
  default: [['Ana sayfa', 'Bugünün planı ve seni bekleyenler.', '/app/overview'], ['Gelen kutusu', 'Dikkat isteyen her şey tek kuyrukta.', '/app/inbox'], ['Uygulamalar', 'Rolüne açık modüller ve favoriler.', '/app/apps']],
};

export default function Welcome() {
  const { me, prefs, setPrefs, features } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [notif, setNotif] = useState(prefs.notifications);
  if (!me) return null;
  const steps = FIRST_STEPS[me.role] ?? FIRST_STEPS.default;
  const finish = async (skipped = false) => { await setPrefs({ welcome_done: true, notifications: notif }); router.replace(skipped ? '/app/overview' : me.role === 'owner' && !features.setup?.completed_at ? '/app/setup' : '/app/overview'); };
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center gap-5 p-6">
      <div className="eyebrow">Hoş geldin · {step + 1} / 3</div>
      {step === 0 && (
        <section className="card grid gap-4">
          <h1 className="text-2xl font-bold">Merhaba {me.name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-muted">{features.orgName ?? 'JS Ecosystem'} çalışma alanına katıldın. Önce profilini kontrol edelim.</p>
          <div className="flex items-center gap-4"><Avatar id={me.employee_id || me.id} name={me.name} size="xl" />
            <dl className="grid gap-1 text-sm"><div><dt className="text-xs text-muted">Ad</dt><dd className="font-semibold">{me.name}</dd></div><div><dt className="text-xs text-muted">Unvan</dt><dd className="font-semibold">{me.title || <span className="text-muted">— (çalışan kartından gelir)</span>}</dd></div><div><dt className="text-xs text-muted">Rol</dt><dd className="font-semibold">{ROLE_LABELS[me.role]}</dd></div></dl></div>
          <p className="text-xs text-muted">Ad ve unvan çalışan kartından okunur; yanlışsa yöneticin JS People / Ana Yönetim Paneli’nden düzeltir. Avatarın baş harflerinden üretilir.</p>
        </section>
      )}
      {step === 1 && (
        <section className="card grid gap-4">
          <h1 className="text-2xl font-bold">Bildirimler</h1>
          <p className="text-sm text-muted">Uygulama içi bildirimler her zaman gelen kutusuna düşer. Diğer kanallar yakında.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notif.in_app} onChange={(e) => setNotif({ ...notif, in_app: e.target.checked })} /> Uygulama içi bildirimler</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notif.mentions} onChange={(e) => setNotif({ ...notif, mentions: e.target.checked })} /> Anıldığımda haber ver</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notif.email_digest} onChange={(e) => setNotif({ ...notif, email_digest: e.target.checked })} /> Günlük e-posta özeti <span className="chip">yakında</span></label>
        </section>
      )}
      {step === 2 && (
        <section className="card grid gap-4">
          <h1 className="text-2xl font-bold">İlk 3 adım</h1>
          <ul className="setup-steps">{steps.map(([t, d, href], i) => <li key={t} className="setup-step"><span className="setup-dot">{i + 1}</span><span className="flex-1"><strong>{t}</strong><span className="block text-xs text-muted">{d}</span></span><Link href={href} onClick={() => void setPrefs({ welcome_done: true, notifications: notif })} className="btn btn-sm">Aç</Link></li>)}</ul>
          <p className="flex items-center gap-2 text-xs text-muted"><Keyboard size={14} aria-hidden /> İpucu: <kbd className="chip">⌘ K</kbd> arama ve eylemler, <kbd className="chip">⌘ J</kbd> “Sor”.</p>
        </section>
      )}
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost" onClick={() => void finish(true)}>Atla</button>
        <div className="flex gap-2">
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Geri</button>}
          {step < 2 ? <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Devam <ArrowRight size={15} aria-hidden /></button> : <button className="btn btn-primary" onClick={() => void finish()}><Check size={15} aria-hidden /> Başla</button>}
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted"><Sparkles size={13} aria-hidden /> Bu ekran bir kez gösterilir; tercihlerin kullanıcı kaydında saklanır.</p>
    </main>
  );
}
