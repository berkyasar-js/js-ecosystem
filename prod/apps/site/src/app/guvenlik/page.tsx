import type { Metadata } from 'next';
import Link from 'next/link';
import { ROLES, ROLE_LABELS, ROLE_GRANTS } from '@jscore/contracts';
import { Code, CtaBand, PageHero, Section } from '@/components/ui';
import { IconArrow } from '@/components/icons';
import { SECURITY } from '@/content/platform';

export const metadata: Metadata = { title: 'Güvenlik', description: 'Supabase RLS, 14 rol ve kapsam, MFA (TOTP), e-posta alan adı kısıtı, denetim kaydı, servis rolü yalnızca sunucuda, veri konumu, KVKK ve yedekleme.', alternates: { canonical: '/guvenlik' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Güvenlik" title="Yetki veritabanında, politika panelde, sırlar sunucuda" lede="Ajans verisi müşteri verisidir. JS Workspace yetkiyi arayüzde değil Postgres satır düzeyinde uygular; yönetim eylemlerini kaydeder; servis anahtarını ve entegrasyon sırlarını istemciye hiç indirmez."
        actions={<><Link href="/demo" className="btn btn-primary btn-lg">Güvenlik incelemesi isteyin <IconArrow size={16} /></Link><Link href="/gizlilik" className="btn btn-lg">Gizlilik</Link></>} />

      <Section title="Güvenlik katmanları">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SECURITY.map((s) => <article key={s.title} className="card"><h3 className="text-lg">{s.title}</h3><p className="mt-2 text-sm">{s.desc}</p><p className="mt-2 text-xs text-muted">{s.detail}</p></article>)}
        </div>
      </Section>

      <Section eyebrow="Rol modeli" title="14 rol, ürün:kaynak:eylem izinleri" lede="İzin kalıpları uygulamanın kaynak kodundan (contracts → ROLE_GRANTS). Owner ve Org Admin için bile bordro ve özlük arşivi varsayılan kapalıdır.">
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="table min-w-[640px]">
            <thead><tr><th>Rol</th><th>İzin kalıpları</th></tr></thead>
            <tbody>{ROLES.map((r) => <tr key={r}><td className="whitespace-nowrap font-semibold">{ROLE_LABELS[r]}</td><td><span className="flex flex-wrap gap-1.5">{ROLE_GRANTS[r].map((g) => <code key={g} className="chip" style={{ fontSize: 10 }}>{g}</code>)}</span></td></tr>)}</tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Mimari" title="İstek yolu">
        <div className="grid gap-4 md:grid-cols-2">
          <Code title="Kullanıcı isteği">{`Tarayıcı ──JWT──▶ Next.js (Repo katmanı)
              └──JWT──▶ Supabase PostgREST ──▶ RLS politikaları
                                                 org_id · rol · kapsam · can_write_task()`}</Code>
          <Code title="Yönetim / entegrasyon isteği">{`Yönetim Paneli ──oturum──▶ requireAdmin()  (memberships servis rolüyle okunur)
                                  └──▶ eylem ──▶ audit_events (admin.*)
Trello / MCP / cron ──Bearer|HMAC──▶ doğrula ──▶ servis rolü (yalnızca sunucu)`}</Code>
        </div>
      </Section>

      <Section eyebrow="Sorumlu açıklama" title="Güvenlik açığı bildirimi">
        <div className="prose">
          <p>Bir açık bulduysanız <a href="mailto:security@jobsstudio.com.tr">security@jobsstudio.com.tr</a> adresine yazın. 72 saat içinde yanıt veririz; düzeltme yayınlanana kadar açığı kamuya açmamanızı rica ederiz.</p>
          <p className="text-xs">Şeffaflık notu: Supabase RLS ve tetikleyiciler canlı veritabanında kurulum sırasında doğrulanır; MFA zorunluluğu bir arayüz kapısıdır (RLS’te aal2 politikası yoktur). Bu sınırlamalar belgelenmiştir ve yol haritasındadır.</p>
        </div>
      </Section>
      <CtaBand title="Güvenlik anketiniz ya da DPA taslağınız mı var?" sub="Kurumsal planda güvenlik incelemesi ve veri işleme sözleşmesi süreci birlikte yürütülür." />
    </>
  );
}
