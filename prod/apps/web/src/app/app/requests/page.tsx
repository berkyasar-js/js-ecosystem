import { RequestsView } from '@/components/modules/requests';

/** Talepler (0017): iş talepleri triyajı ve göreve dönüştürme. */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <RequestsView tab={tab} />;
}
