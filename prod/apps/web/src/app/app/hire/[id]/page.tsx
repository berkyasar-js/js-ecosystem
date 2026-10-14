import { CandidateDetail } from '@/components/modules/hire';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateDetail id={decodeURIComponent(id)} />;
}
