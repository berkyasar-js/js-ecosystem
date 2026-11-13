import { ProductionTabs } from '@/components/production-tabs';

/** Üretim hub'ı: Studio/Social/Media/Review/Transfer/Present/Marketing/Events sayfaları eski URL'lerinde kalır, üstte ortak sekme şeridi alır. */
export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return <><ProductionTabs />{children}</>;
}
