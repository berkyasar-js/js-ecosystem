import type { Proposal } from '@jscore/contracts';
import { dueDateFor, proposalTotals } from '@jscore/core/domain';
import { buildPdf, type PdfDoc } from './pdf';

const tl = (minor: number) => `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(minor / 100)} TL`;

export function proposalDoc(p: Proposal, brandName: string): PdfDoc {
  const t = proposalTotals(p.lines, p.vat_pct);
  return {
    title: `Teklif ${p.number} · ${p.title}`, subtitle: `${brandName} icin hazirlanmistir`, footer: p.number,
    meta: [['Teklif no', p.number], ['Surum', `v${p.version}`], ['Gecerlilik', p.valid_until], ['Vade', `${p.payment_terms_days} gun (${dueDateFor(p.valid_until, p.payment_terms_days)})`]],
    blocks: [
      { t: 'h2', text: 'Kalemler' },
      { t: 'table', cols: [{ h: 'Kalem', w: 50 }, { h: 'Adet', w: 10, align: 'right' }, { h: 'Birim', w: 18, align: 'right' }, { h: 'Tutar', w: 20, align: 'right' }],
        rows: p.lines.map((l) => [l.desc, String(l.qty), tl(l.unit_minor), tl(Math.round(l.qty * l.unit_minor))]), foot: ['', '', 'Toplam', tl(t.total)] },
      { t: 'kv', rows: [['Ara toplam', tl(t.subtotal)], [`KDV %${p.vat_pct}`, tl(t.vat)], ['Genel toplam', tl(t.total)]] },
      { t: 'h2', text: 'Sartlar' }, { t: 'p', text: `Odeme vadesi fatura tarihinden itibaren ${p.payment_terms_days} gundur. Teklif ${p.valid_until} tarihine kadar gecerlidir.` },
    ],
  };
}
export const proposalPdfBytes = (p: Proposal, brandName: string) => buildPdf(proposalDoc(p, brandName)).bytes;
