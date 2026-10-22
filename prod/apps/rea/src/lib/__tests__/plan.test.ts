import { describe, expect, it } from 'vitest';
import { estimateEffort, generatePlan, slugify } from '../plan';
import { sampleDigest, sampleFlow, sampleProject } from '../sample';
import type { Flow } from '../types';

const project = sampleProject();

describe('slugify', () => {
  it('Türkçe karakterleri ve parantezleri temizler', () => {
    expect(slugify('Wispr Flow — yazıyı imlece yapıştırma (örnek)')).toBe('wispr_flow_yaziyi_imlece_yap');
    expect(slugify('')).toBe('ozellik');
  });
});

describe('generatePlan', () => {
  const { markdown, effort, slug } = generatePlan({ project, flow: sampleFlow(), digest: sampleDigest(), generatedAt: '2026-10-14T00:00:00Z' });

  it('tüm bölümleri Türkçe başlıklarla üretir', () => {
    for (const h of ['# Taşıma planı:', '## 1. Amaç', '## 2. Çıkarılan akış', '### 3.1 Modül', '### 3.2 Veri modeli', '### 3.3 Ekranlar', '### 3.4 API', '### 3.5 İşletim sistemi', '## 4. Riskler', '## 5. Tahmini efor', '## 6. Önerilen sıra', '## 7. Kabul ölçütleri']) {
      expect(markdown).toContain(h);
    }
  });
  it('akış adımlarını ve kanıt sembollerini taşır', () => {
    expect(markdown).toContain('Yapay zekâ metni düzeltir');
    expect(markdown).toContain('`getTextBoxInfo`');
    expect(markdown).toContain(`create table public.${slug}_items`);
  });
  it('yardımcı program varsa platform kararını ve izin uyarısını ekler', () => {
    expect(markdown).toContain('masaüstü yardımcı');
    expect(markdown).toContain('Erişilebilirlik');
  });
  it('hukuki uyarıyı her zaman içerir', () => {
    expect(markdown).toContain('kopyalamayın');
    expect(markdown).toContain('kullanım koşullarını');
  });
  it('efor aralığı tutarlı', () => {
    expect(effort.min).toBeLessThanOrEqual(effort.days);
    expect(effort.max).toBeGreaterThanOrEqual(effort.days);
    expect(markdown).toContain(`~${effort.days} gün`);
  });
  it('AI sentez yokken de çalışır ve bunu söyler', () => {
    const r = generatePlan({ project, flow: null, digest: null });
    expect(r.markdown).toContain('AI sentez');
    expect(r.markdown).toContain('Akış henüz çıkarılmadı');
    expect(r.effort.days).toBeGreaterThan(0);
  });
  it('modül eşlemesi anahtar sözcüklerden gelir', () => {
    expect(markdown).toContain('Ajanlar (agents / agent_runs, kota)');
  });
  it('tablo hücrelerindeki | karakterini kaçırır', () => {
    const f: Flow = { ...sampleFlow(), blind_spots: [{ title: 'a|b', detail: 'x|y' }] };
    expect(generatePlan({ project, flow: f, digest: null }).markdown).toContain('a\\|b');
  });
});

describe('estimateEffort', () => {
  it('düşük güvenli adım eforu artırır; yardımcı program +5 gün', () => {
    const f = sampleFlow();
    const noHelper = { ...f, has_helper: false, helper_programs: [] };
    const lowConf: Flow = { ...noHelper, steps: noHelper.steps.map((s) => ({ ...s, confidence: 'düşük' as const })) };
    const hi: Flow = { ...noHelper, steps: noHelper.steps.map((s) => ({ ...s, confidence: 'yüksek' as const })) };
    const e = (flow: Flow, digest = null) => estimateEffort({ project, flow, digest }).days;
    expect(e(lowConf)).toBeGreaterThan(e(hi));
    expect(e({ ...hi, has_helper: true })).toBeGreaterThan(e(hi) + 4);
  });
  it('beden eşikleri', () => {
    const one = { ...sampleFlow(), steps: sampleFlow().steps.slice(0, 1).map((s) => ({ ...s, confidence: 'yüksek' as const })), has_helper: false, helper_programs: [], blind_spots: [] };
    expect(estimateEffort({ project, flow: one, digest: null }).size).toBe('S');
    expect(estimateEffort({ project, flow: sampleFlow(), digest: sampleDigest() }).size).not.toBe('S');
  });
});
