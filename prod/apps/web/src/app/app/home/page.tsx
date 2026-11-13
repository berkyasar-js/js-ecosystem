import { redirect } from 'next/navigation';

/** Ana Sayfa'nın kanonik adresi /app/overview; /app/home kısayolu oraya yönlenir. */
export default function HomeRedirect() { redirect('/app/overview'); }
