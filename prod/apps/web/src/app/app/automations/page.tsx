import { AutomationsView } from '@/components/modules/automations';

/** Sunucu bileşeni: ?tab= çözümler; veri, oturumun repo'su üzerinden istemci bileşeninde yüklenir (demo verisi tarayıcıda kalıcıdır). */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <AutomationsView tab={tab} />;
}
