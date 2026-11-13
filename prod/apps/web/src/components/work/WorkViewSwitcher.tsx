'use client';
import { Activity, Folder, History, LayoutGrid, List, Users } from 'lucide-react';
import { useFeature } from '../session';
import type { WorkView } from './work-utils';

const VIEWS: Array<[WorkView, string, typeof List]> = [['list', 'Liste', List], ['board', 'Pano', LayoutGrid], ['summary', 'Özet', Activity], ['activity', 'Akış', History], ['members', 'Üyeler', Users], ['files', 'Dosyalar', Folder]];

/** Düz gezinme düğmeleri (ARIA tab klavye sözleşmesi iddia edilmez). */
export function WorkViewSwitcher({ value, onChange, views = ['list', 'board', 'summary', 'activity', 'members', 'files'] }: { value: WorkView; onChange: (v: WorkView) => void; views?: WorkView[] }) {
  const boardOn = useFeature('tasks.board_view');
  return (
    <nav className="wk-view-tabs" aria-label="Proje görünümleri">
      {VIEWS.filter(([v]) => views.includes(v) && (v !== 'board' || boardOn)).map(([v, label, Icon]) => (
        <button key={v} type="button" aria-current={value === v ? 'page' : undefined} onClick={() => onChange(v)}><Icon size={15} aria-hidden />{label}</button>
      ))}
    </nav>
  );
}
