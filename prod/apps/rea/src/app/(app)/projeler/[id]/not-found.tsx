import Link from 'next/link';
import { Empty } from '@/components/ui';

export default function NotFound() {
  return <Empty>Proje bulunamadı. <Link className="text-button" href="/projeler">Projelere dön</Link></Empty>;
}
