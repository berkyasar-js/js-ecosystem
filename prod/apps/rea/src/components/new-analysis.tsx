'use client';
import { Globe, Laptop, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, uploadFile } from '@/lib/client-upload';
import { MAX_UPLOAD_BYTES } from '@/lib/limits';
import { buildLocalCommands, normalizeWebUrl } from '@/lib/rea/requests';
import type { Project, TargetKind } from '@/lib/types';
import { CommandBlock } from './copy';
import { Dropzone } from './dropzone';

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1048576);

export function NewAnalysis({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<TargetKind>('web');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [hint, setHint] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState('');
  const [seeds, setSeeds] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const uploadsOff = demo && kind !== 'web';
  const steps = useMemo(() => buildLocalCommands(hint, name || 'analiz'), [hint, name]);
  const urlCheck = kind === 'web' && url.trim() ? normalizeWebUrl(url) : null;
  const autoName = name.trim() || (urlCheck?.ok ? urlCheck.host : file?.name.replace(/\.(asar|zip|json)$/i, '') ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (autoName.length < 2) { setErr('Projeye bir ad ver.'); return; }
    if (!ack) { setErr('Kullanım koşulları onayını işaretle.'); return; }
    if (kind === 'web' && !(urlCheck && urlCheck.ok)) { setErr(urlCheck && !urlCheck.ok ? urlCheck.error : 'Bir adres gir.'); return; }
    if (kind === 'bundle' && !file) { setErr('Bir .asar ya da .zip dosyası seç.'); return; }
    try {
      let up: { path: string; name: string; bytes: number } | null = null;
      if (kind !== 'web' && file) { setBusy('Dosya yükleniyor…'); up = await uploadFile(kind, file); }
      setBusy('Proje oluşturuluyor…');
      const { project } = await api<{ project: Project }>('/api/projects', 'POST', {
        name: autoName, target_kind: kind,
        target_url: kind === 'web' ? url.trim() : kind === 'local' ? hint.trim() || null : null,
        upload_path: up?.path ?? null, upload_name: up?.name ?? null, upload_bytes: up?.bytes ?? null,
        question: question.trim(), seeds: seeds.split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 12),
      });
      if (kind === 'web' || up) { setBusy('Analiz başlatılıyor…'); await api(`/api/projects/${project.id}/run`, 'POST'); }
      router.push(`/projeler/${project.id}`);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Beklenmeyen hata'); setBusy(null); }
  };

  const kinds: Array<{ id: TargetKind; title: string; text: string; icon: typeof Globe }> = [
    { id: 'web', title: 'Web sitesi (URL)', text: 'Sayfa ve script dosyaları sunucudan indirilir, statik analiz edilir. Tarayıcıda çalıştırma yok.', icon: Globe },
    { id: 'bundle', title: 'Electron / JS paketi', text: `app.asar ya da .zip yükle (en çok ${MAX_MB} MB). Sunucuda REA ile analiz edilir.`, icon: Package },
    { id: 'local', title: 'Bilgisayarımda', text: 'Analizi kendi makinende REA ile çalıştır, JSON çıktısını yükle. Büyük uygulamalar için.', icon: Laptop },
  ];

  return (
    <form onSubmit={submit} className="stack-y" noValidate>
      <section className="card" aria-labelledby="t-h">
        <h2 id="t-h" className="h2">1. Ne inceleyeceksin?</h2>
        <div className="kind-grid mt-3" role="radiogroup" aria-label="Hedef türü">
          {kinds.map((k) => (
            <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className="kind-card" onClick={() => { setKind(k.id); setFile(null); setErr(null); }}>
              <k.icon size={20} aria-hidden /><strong>{k.title}</strong><span>{k.text}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4">
          {kind === 'web' && (
            <div className="field">
              <label className="label" htmlFor="url">Adres</label>
              <input id="url" className="input" inputMode="url" placeholder="https://ornek.com/uygulama" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={urlCheck ? !urlCheck.ok : undefined} aria-describedby="url-h" />
              <p id="url-h" className={urlCheck && !urlCheck.ok ? 'err' : 'hint'}>{urlCheck && !urlCheck.ok ? urlCheck.error : 'Herkese açık bir http(s) adresi. Giriş gerektiren sayfalar görünmez; o durumda "Bilgisayarımda" seçeneğini kullan.'}</p>
            </div>
          )}
          {kind === 'bundle' && (
            <div className="field">
              <span className="label">Paket dosyası</span>
              <Dropzone accept=".asar,.zip" file={file} onFile={setFile} maxMb={MAX_MB} disabled={uploadsOff} hint={uploadsOff ? 'Demo modunda yükleme kapalı.' : `Mac'te: Uygulama → Paket İçeriğini Göster → Contents/Resources/app.asar · en çok ${MAX_MB} MB`} />
            </div>
          )}
          {kind === 'local' && (
            <>
              <div className="field">
                <label className="label" htmlFor="hint">Uygulama yolu ya da web adresi (isteğe bağlı)</label>
                <input id="hint" className="input" placeholder="/Applications/Uygulama.app/Contents/Resources/app.asar" value={hint} onChange={(e) => setHint(e.target.value)} />
                <p className="hint">Yazarsan komutlar buna göre hazırlanır. http(s) adresi yazarsan web yakalama komutları çıkar.</p>
              </div>
              <div className="cmd-steps">{steps.map((s) => <CommandBlock key={s.title} title={s.title} text={s.command} note={s.note} />)}</div>
              <div className="field">
                <span className="label">REA çıktısı (.json) — şimdi ya da proje sayfasından sonra yükleyebilirsin</span>
                <Dropzone accept=".json" file={file} onFile={setFile} maxMb={MAX_MB} disabled={uploadsOff} hint={uploadsOff ? 'Demo modunda yükleme kapalı.' : `En çok ${MAX_MB} MB`} />
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card grid gap-4" aria-labelledby="q-h">
        <h2 id="q-h" className="h2">2. Neyi merak ediyorsun?</h2>
        <div className="field">
          <label className="label" htmlFor="name">Proje adı</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName || 'Örn. Wispr Flow — yazıyı imlece yapıştırma'} maxLength={120} />
        </div>
        <div className="field">
          <label className="label" htmlFor="q">Özellik sorusu</label>
          <textarea id="q" className="input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} placeholder="Konuşmayı bitirdiğimde yazının imlecin olduğu kutuya nasıl yazıldığını bul." />
          <p className="hint">Soru ne kadar dar olursa cevap o kadar iyi: &quot;bu uygulama nasıl çalışıyor?&quot; yerine &quot;şu butona basınca ne oluyor?&quot;</p>
        </div>
        <div className="field">
          <label className="label" htmlFor="seeds">Aranacak fonksiyon / mesaj adları (isteğe bağlı)</label>
          <input id="seeds" className="input" value={seeds} onChange={(e) => setSeeds(e.target.value)} placeholder="getTextBoxInfo, PasteText" />
          <p className="hint">Virgülle ayır. REA&apos;nın &quot;izle&quot; komutu 0 sonuç verse bile paket içinde bu adlar aranır.</p>
        </div>
        <label className="row" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 4, width: 16, height: 16 }} />
          <span className="text-[13px]">Bu uygulamayı öğrenmek için inceliyorum; kullanım koşullarına baktım, bulduğum kodu kopyalamayacağım ve şifre/lisans/güvenlik önlemi aşmak için kullanmayacağım.</span>
        </label>
      </section>

      {err && <p role="alert" className="err">{err}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={!!busy || uploadsOff && kind === 'bundle'}>
          {busy ?? (kind === 'web' ? 'Analizi başlat' : kind === 'bundle' ? 'Yükle ve analiz et' : file ? 'Yükle ve özetle' : 'Projeyi oluştur')}
        </button>
        {kind === 'web' && <span className="hint">Süre: genellikle 20–120 sn · en çok 5 dk</span>}
      </div>
    </form>
  );
}
