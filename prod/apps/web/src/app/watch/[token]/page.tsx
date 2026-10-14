export const metadata = { title: 'İzleme bağlantısı — JS Ecosystem' };

/** Herkese açık, süreli izleme linki. Üretimde token → projects/transfer kaydına bağlanır (service role ile). */
export default async function Watch({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const demo = token === 'demo';
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center gap-4 p-6">
      <h1 className="text-2xl font-extrabold">JS <span className="text-accent">Ecosystem</span> · İzleme</h1>
      {demo ? (
        <div className="card">
          <span className="chip chip-warn">Demo bağlantısı</span>
          <h2 className="mt-3 text-lg font-bold">Anova · Lansman filmi — offline kurgu v1</h2>
          <p className="mt-2 text-sm text-muted">Bu sayfa, müşteriye gönderilen süreli izleme linkinin örneğidir. Gerçek bağlantılarda video oynatıcı ve zaman kodlu yorum alanı bulunur.</p>
        </div>
      ) : (
        <div className="card text-sm text-muted" role="alert">Bu bağlantı geçersiz veya süresi dolmuş.</div>
      )}
    </main>
  );
}
