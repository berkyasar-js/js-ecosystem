import type { Digest, Finding, Flow, Project, Run } from './types';

export const DEMO_ORG = 'org_demo';
export const SAMPLE_PROJECT_ID = '00000000-0000-4000-8000-00000000a001';
const SAMPLE_RUN_ID = '00000000-0000-4000-8000-00000000b001';
const SAMPLE_FINDING_ID = '00000000-0000-4000-8000-00000000c001';
const T = '2026-10-14T09:00:00.000Z';

export const SAMPLE_QUESTION = 'Konuşmayı bitirdiğimde yazının imlecin olduğu kutuya nasıl yazıldığını bul.';

/** Rehberdeki Wispr Flow örneği. Dosya yolu / satır rehberde verilmediği için boş bırakıldı; uydurulmadı. */
export function sampleProject(): Project {
  return {
    id: SAMPLE_PROJECT_ID, org_id: DEMO_ORG, name: 'Wispr Flow — yazıyı imlece yapıştırma (örnek)', target_kind: 'local',
    target_url: '/Applications/Wispr Flow.app/Contents/Resources/app.asar', upload_path: null, upload_name: 'wispr.json', upload_bytes: 59 * 1024 * 1024,
    question: SAMPLE_QUESTION, seeds: ['getTextBoxInfo', 'PasteText', 'PrePastePolish', 'pasteTextAndRelaunchHelperIfNeeded'],
    status: 'done', created_at: T, updated_at: T,
  };
}

export function sampleDigest(): Digest {
  const note = 'Rehberdeki Wispr Flow örneğinden; dosya yolu rehberde verilmediği için boş.';
  return {
    source: 'sample',
    stats: { parsed_javascript_files: 167, modules: 1428, ipc_operations: 207, analiz_suresi_sn: 82 },
    keywords: ['getTextBoxInfo', 'PasteText', 'PrePastePolish', 'pasteTextAndRelaunchHelperIfNeeded'],
    items: [
      { kind: 'function', label: 'PrePastePolish', file: null, line: null, snippet: null, note: `Yapay zekâ düzeltmesi; başarısızsa ham metin. ${note}` },
      { kind: 'function', label: 'getTextBoxInfo', file: null, line: null, snippet: null, note: `İmleç yazılabilir kutuda mı? ${note}` },
      { kind: 'ipc-channel', label: 'PasteText', file: null, line: null, snippet: null, note: `Yardımcı programa giden istek. ${note}` },
      { kind: 'function', label: 'pasteTextAndRelaunchHelperIfNeeded', file: null, line: null, snippet: null, note: `Yardımcı program kapanmışsa yeniden başlatır. ${note}` },
    ],
    helpers: [{ path: 'swift-helper-app-dist/', why: 'Paketin içinde Swift ile yazılmış ikinci bir "Wispr Flow" uygulaması (rehber).' }],
    limitations: ['REA\'nın "özelliği izle" (trace-application-feature) komutu 6 başlangıç noktasının hepsinde 0 sonuç döndürdü (rehber).', 'REA, bu uygulama için çıkardığı haritanın eksik olduğunu kendi çıktısında belirtiyor (rehber).'],
    unknowns: [],
  };
}

export function sampleRun(projectId: string): Run {
  return {
    id: SAMPLE_RUN_ID, project_id: projectId, org_id: DEMO_ORG, status: 'done', stage: 'kayit', progress: 100, message: 'Tamamlandı (örnek veri)', log: ['Örnek: Wispr Flow taraması yaklaşık 82 saniye sürdü.'], error: null,
    summary: { stats: { format: 'asar', relevant_files: null, parsed_javascript_files: 167, modules: 1428, findings: null, ipc_operations: 207, ipc_literal_channels: null, browser_windows: null, native_addon_bindings: null, parse_failures: null } },
    digest: sampleDigest(), evidence_bytes: 59 * 1024 * 1024, evidence_truncated: true, started_at: T, finished_at: T, created_at: T,
  };
}

export function sampleFlow(): Flow {
  return {
    summary: 'Kısayol tuşuyla konuşulan ses yazıya çevrilir, metin yapay zekâyla düzeltilir; yazma işini Electron değil, paketin içindeki ayrı bir Swift yardımcı uygulaması yapar ve sonuç doğrulanır.',
    steps: [
      { title: 'Konuşursun, ses yazıya çevrilir', description: 'Kısayol tuşuna basılıp konuşulur; bırakınca ses yazıya çevrilir.', confidence: 'orta', evidence: [] },
      { title: 'Yapay zekâ metni düzeltir', description: 'Düzeltme başarısız olursa ham metin kullanılır.', confidence: 'yüksek', evidence: [{ file: null, symbol: 'PrePastePolish', snippet: null }] },
      { title: 'İmleç yazılabilir bir kutuda mı?', description: 'Uygulama önce bunu sorar; değilse metni yapıştırmaz, bildirim olarak gösterir.', confidence: 'yüksek', evidence: [{ file: null, symbol: 'getTextBoxInfo', snippet: null }] },
      { title: 'Yazıyı gizli küçük bir program yazar', description: 'Metni Electron yapıştırmaz; paketin içindeki Swift yardımcı uygulamasına PasteText isteği gider. Program kapanmışsa yeniden başlatılır.', confidence: 'yüksek', evidence: [{ file: 'swift-helper-app-dist/', symbol: 'PasteText', snippet: null }, { file: null, symbol: 'pasteTextAndRelaunchHelperIfNeeded', snippet: null }] },
      { title: 'Gerçekten yazıldı mı?', description: 'Yapıştırmadan önce ve sonra kutudaki metne bakılıp yazının gerçekten çıktığı doğrulanır.', confidence: 'orta', evidence: [] },
    ],
    blind_spots: [
      { title: 'REA tek başına akışı bulamadı', detail: '"Özelliği izle" komutu denenen 6 başlangıç noktasında 0 sonuç verdi. Zincir, taramadan sonra paketlenmiş kodda fonksiyon ve mesaj adları aranarak bulundu.' },
      { title: 'Eksik harita', detail: 'REA kendi çıktısında bu uygulama için çıkardığı haritanın eksik olduğunu söylüyor.' },
    ],
    helper_programs: [{ name: 'Wispr Flow (Swift yardımcı uygulaması)', path: 'swift-helper-app-dist/', role: 'Metni imlecin olduğu kutuya yapıştırır; PasteText isteğini alır.', evidence: 'Paket içeriğinde ikinci bir "Wispr Flow" uygulaması.' }],
    has_helper: true,
    next_questions: ['Mac\'te hangi adım Erişilebilirlik izni gerektiriyor?', 'Yapıştırma sonrası doğrulama hangi sinyale bakıyor?'],
  };
}

export function sampleFinding(projectId: string, runId: string): Finding {
  return { id: SAMPLE_FINDING_ID, project_id: projectId, run_id: runId, org_id: DEMO_ORG, kind: 'synthesis', title: 'Özellik akışı (örnek: rehberden)', body: sampleFlow(), model: 'rehber', created_at: T };
}
