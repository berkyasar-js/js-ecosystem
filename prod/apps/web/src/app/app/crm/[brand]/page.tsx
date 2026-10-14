import { Account360 } from '@/components/modules/crm';

export default async function Page({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params;
  return <Account360 brandId={decodeURIComponent(brand)} />;
}
