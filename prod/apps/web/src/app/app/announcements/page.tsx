import { AnnouncementsView } from '@/components/announcements';

/** Duyurular (0017): akış, okundu onayı / anket, yeni duyuru. */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <AnnouncementsView tab={tab} />;
}
