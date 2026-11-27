import type { ComponentType } from 'react';

/** Ortak ikon sözleşmesi: lucide bileşenleri ve Atelier sprite ikonları aynı biçimde kullanılır. */
export type AppIcon = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

/** Atelier sprite kimlikleri (public/icons/atelier-icons.svg — 39 sembol, 24×24, currentColor). */
export const ATELIER_ICON_IDS = [
  'overview', 'inbox', 'projects', 'clients', 'production', 'team', 'finance', 'messages', 'apps', 'search', 'plus', 'filter', 'sort', 'calendar', 'clock',
  'alert', 'check', 'chevron-right', 'chevron-down', 'chart', 'external', 'settings', 'file', 'image', 'approval', 'brief', 'strategy', 'creative',
  'publish', 'report', 'menu', 'close', 'help', 'more', 'user', 'bell', 'list', 'board', 'timeline',
] as const;
export type AtelierIconId = (typeof ATELIER_ICON_IDS)[number];

/** Dekoratif kullanım varsayılandır (aria-hidden); ikon tek başına anlam taşıyorsa erişilebilir adı düğmeye/bağlantıya ver. */
export function AtelierIcon({ id, size = 18, className }: { id: AtelierIconId; size?: number; className?: string }) {
  return <svg className={`at-icon ${className ?? ''}`} width={size} height={size} aria-hidden="true" focusable="false"><use href={`/icons/atelier-icons.svg#${id}`} /></svg>;
}
/** Sprite ikonunu lucide ile aynı prop'ları alan bileşene çevirir (ICONS haritası için). */
export const atelier = (id: AtelierIconId): AppIcon => {
  const Icon: AppIcon = ({ size, className }) => <AtelierIcon id={id} size={size} className={className} />;
  Icon.displayName = `Atelier(${id})`;
  return Icon;
};
