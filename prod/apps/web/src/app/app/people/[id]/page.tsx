import { Employee360 } from '@/components/modules/people';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <Employee360 id={decodeURIComponent(id)} tab={tab} />;
}
