import Link from 'next/link';
import { PageHero } from '@/components/ui';

export default function NotFound() {
  return <PageHero eyebrow="404" title="Sayfa bulunamadı" lede="Aradığınız sayfa taşınmış ya da hiç olmamış olabilir." actions={<><Link href="/" className="btn btn-primary">Ana sayfa</Link><Link href="/urun" className="btn">Ürün</Link></>} />;
}
