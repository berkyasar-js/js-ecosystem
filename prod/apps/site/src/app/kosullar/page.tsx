import type { Metadata } from 'next';
import { PageHero, Prose, Section } from '@/components/ui';
import { SITE } from '@/content/site';

export const metadata: Metadata = { title: 'Kullanım koşulları (taslak)', robots: { index: false }, alternates: { canonical: '/kosullar' } };

export default function Page() {
  return (
    <>
      <PageHero eyebrow="Koşullar" title="Kullanım koşulları" lede={<><span className="chip chip-warn mr-2">Taslak</span>Bu metin yer tutucudur; abonelik sözleşmesi ve DPA ayrıca imzalanır.</>} />
      <Section className="py-4"><Prose>
        <h2>1. Taraflar ve kapsam</h2><p>Bu koşullar {SITE.company} ile JS Workspace hizmetini kullanan kuruluş arasındaki ilişkiyi düzenler. JS Workspace açık kaynak değildir; lisans, abonelik ya da kurulum sözleşmesiyle kullanılır.</p>
        <h2>2. Hesaplar ve koltuklar</h2><p>Abone, kullanıcılarının eylemlerinden sorumludur. Koltuk, aktif üyelik sayısıdır; devre dışı üyelikler koltuk saymaz.</p>
        <h2>3. Yapay zekâ özellikleri</h2><p>Ajan çıktıları öneri niteliğindedir; kararlar abonenin yetkili kullanıcıları tarafından verilir. Ajan maliyetleri plan kapsamındaki bütçeyi aşarsa kullanım başına faturalanır ya da tavan ile durdurulur.</p>
        <h2>4. Veri</h2><p>Abone verisinin mülkiyeti abonededir. {SITE.company} veriyi yalnızca hizmeti sunmak için işler; ayrıntılar <a href="/gizlilik">gizlilik politikası</a> ve DPA’dadır.</p>
        <h2>5. Fesih</h2><p>Abone dilediği zaman verisini JSON olarak dışa aktarabilir ve aboneliği sonlandırabilir.</p>
        <h2>6. Uygulanacak hukuk</h2><p>Türkiye Cumhuriyeti hukuku uygulanır; İstanbul mahkemeleri yetkilidir. Son güncelleme: taslak.</p>
      </Prose></Section>
    </>
  );
}
