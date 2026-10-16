import type { TrelloSnapshot } from './trello-map';

/** Demo için küçük Trello örneği: gerçek çalışma alanındaki adlandırma kalıplarını yansıtır (10 kart, 1 şablon, 1 arşivli liste). */
export const TRELLO_FIXTURE: TrelloSnapshot = {
  boards: [{ id: 'b1', name: '2_Tasarım&Produksiyon' }, { id: 'b2', name: '3_Müşteri İlişkileri' }],
  lists: [
    { id: 'l1', idBoard: 'b1', name: 'Selin T.' },
    { id: 'l3', idBoard: 'b2', name: 'Öykü' },
    { id: 'l4', idBoard: 'b2', name: 'Berfin' },
    { id: 'l5', idBoard: 'b2', name: 'Müşteri Onay' },
    { id: 'l6', idBoard: 'b1', name: 'Bekleme Salonu <3' },
    { id: 'l7', idBoard: 'b1', name: 'Kasım26 SM' },
    { id: 'l8', idBoard: 'b1', name: 'ŞABLONLAR' },
    { id: 'l9', idBoard: 'b2', name: 'Eski Kuyruk', closed: true },
    { id: 'l10', idBoard: 'b1', name: 'Melih Çekim' },
  ],
  members: [
    { id: 'm1', fullName: 'Selin Kutlutürk' }, { id: 'm3', fullName: 'seda' }, { id: 'm4', fullName: 'Raif Vural' },
  ],
  cards: [
    { id: 'c01', idBoard: 'b1', idList: 'l7', name: "184_Anova Kasım'26 SM", due: '2026-11-05T09:00:00.000Z', labels: [{ name: 'Reels', color: 'blue' }], badges: { checkItems: 6, checkItemsChecked: 2 } },
    { id: 'c02', idBoard: 'b2', idList: 'l3', name: '253_Badem Satış Kampanyası', due: '2026-09-30T12:00:00.000Z', labels: [{ name: '', color: 'red' }], badges: { checkItems: 12, checkItemsChecked: 4 } },
    { id: 'c03', idBoard: 'b2', idList: 'l9', name: "Noche Madencilik Mart'25 SM", due: '2025-03-28T09:00:00.000Z', dueComplete: true },
    { id: 'c04', idBoard: 'b2', idList: 'l4', name: 'Tanoto2- Online Rezervasyon Pop Up', idMembers: ['m1'], due: '2026-10-02T09:00:00.000Z' },
    { id: 'c05', idBoard: 'b1', idList: 'l6', name: '001_Korelio Web Sitesi' },
    { id: 'c06', idBoard: 'b1', idList: 'l1', name: "Premium İşitme Ekim'26 SM", due: '2026-10-20T09:00:00.000Z' },
    { id: 'c07', idBoard: 'b1', idList: 'l10', name: 'Meva Lansman Filmi', due: '2026-10-28T09:00:00.000Z' },
    { id: 'c08', idBoard: 'b1', idList: 'l7', name: "MarkAntalya Kasım'26 SM", idMembers: ['m3'], due: '2026-11-12T09:00:00.000Z' },
    { id: 'c09', idBoard: 'b2', idList: 'l5', name: 'Dora Rapor Tasarımı', idMembers: ['m4'], due: '2026-10-18T09:00:00.000Z' },
    { id: 'c10', idBoard: 'b1', idList: 'l8', name: 'SM Aylık Şablon' },
  ],
};
