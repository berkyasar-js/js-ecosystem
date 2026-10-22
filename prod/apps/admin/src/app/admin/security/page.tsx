'use client';
import { useEffect, useState } from 'react';
import { API_TOKEN_SCOPES, normalizeDomains, type OrgSettings } from '@jscore/contracts';
import { Async, PageHeader } from '@/components/ui';
import { Msg, errText } from '@/components/admin-ui';
import { useAdminSettings } from '@/lib/client';

export default function Security() {
  const st = useAdminSettings();
  const [s, setS] = useState<OrgSettings['security'] | null>(null);
  const [domains, setDomains] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (st.settings) { setS(st.settings.security); setDomains((st.settings.security.allowed_email_domains ?? []).join('\n')); } }, [st.settings]);
  const save = async () => {
    if (!s) return;
    try {
      const allowed = normalizeDomains(domains.split(/[\n,]/));
      await st.save({ security: { ...s, allowed_email_domains: allowed, mfa_required: s.require_mfa ?? s.mfa_required } });
      setMsg({ ok: true, text: 'Güvenlik ayarları kaydedildi.' });
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  const allowedScopes = s?.token_allowed_scopes ?? [];
  return (
    <>
      <PageHeader title="Güvenlik" sub="MFA, oturum, e-posta alan adı kısıtı ve API anahtarı politikası" />
      <Msg m={msg} />
      <Async q={{ data: st.settings, error: st.error, loading: st.loading }}>{() => s && (
        <div className="grid max-w-3xl gap-5">
          <section className="card grid gap-3"><h2 className="font-bold">Çok faktörlü doğrulama (MFA)</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={!!s.require_mfa} onChange={(e) => setS({ ...s, require_mfa: e.target.checked })} /> Tüm kullanıcılardan MFA (TOTP) iste</label>
            <p className="text-xs text-muted">Açıkken kullanıcı uygulamasında her kullanıcı, doğrulayıcı uygulama (TOTP) kaydı yapana ve kodu girene kadar içeri alınmaz. Supabase → Authentication → MFA → TOTP etkin olmalıdır. Cihazı kaybeden kullanıcı için Kullanıcılar → “MFA’yı sıfırla”.</p></section>
          <section className="card grid gap-3"><h2 className="font-bold">Oturum</h2>
            <div><label className="label" htmlFor="sh">Oturum süresi (saat)</label><input id="sh" type="number" min={1} max={720} className="input max-w-xs" value={s.session_hours} onChange={(e) => setS({ ...s, session_hours: Number(e.target.value) })} /></div>
            <p className="text-xs text-muted">Not: Supabase oturum süresi (JWT/time-box) proje ayarlarından (Dashboard → Authentication → Sessions) uygulanır; bu değer politika kaydıdır.</p>
            <div><label className="label" htmlFor="ip">IP izin listesi (satır başına bir)</label><textarea id="ip" className="input min-h-20" value={s.ip_allowlist.join('\n')} onChange={(e) => setS({ ...s, ip_allowlist: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></div></section>
          <section className="card grid gap-3"><h2 className="font-bold">Google ile giriş — izinli e-posta alan adları</h2>
            <textarea aria-label="İzinli alan adları" className="input min-h-20" placeholder={'jobsstudio.co\nornek.com'} value={domains} onChange={(e) => setDomains(e.target.value)} />
            <p className="text-xs text-muted">Boş = kısıtlama yok. Doluysa kullanıcı uygulamasının giriş geri çağrısında alan adı listede değilse oturum kapatılır ve mesaj gösterilir. E-posta kodu (OTP) ile davet edilen kullanıcılar bu kısıttan etkilenmez.</p></section>
          <section className="card grid gap-3"><h2 className="font-bold">API anahtarı politikası</h2>
            <div><label className="label" htmlFor="tmd">En uzun ömür (gün) · 0 = sınırsız izinli</label><input id="tmd" type="number" min={0} max={3650} className="input max-w-xs" value={s.token_max_days ?? 0} onChange={(e) => setS({ ...s, token_max_days: Number(e.target.value) })} /></div>
            <fieldset><legend className="label">İzinli kapsamlar (hiçbiri seçili değilse hepsi)</legend>
              <div className="flex flex-wrap gap-3">{API_TOKEN_SCOPES.map((sc) => <label key={sc} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowedScopes.includes(sc)} onChange={(e) => setS({ ...s, token_allowed_scopes: e.target.checked ? [...allowedScopes, sc] : allowedScopes.filter((x) => x !== sc) })} /> <code>{sc}</code></label>)}</div></fieldset>
            <p className="text-xs text-muted">Politika yeni anahtar oluştururken uygulanır; mevcut anahtarları Entegrasyonlar → API Anahtarları’ndan iptal edin.</p></section>
          <button className="btn btn-primary w-fit" onClick={() => void save()}>Kaydet</button>
        </div>
      )}</Async>
    </>
  );
}
