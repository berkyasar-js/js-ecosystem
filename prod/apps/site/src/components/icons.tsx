import type { SVGProps } from 'react';

/** Küçük satır içi ikon seti (bağımlılık yok). */
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 18, ...p }: P) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const IconArrow = (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconCheck = (p: P) => <svg {...base(p)}><path d="M5 12l5 5L20 7" /></svg>;
export const IconMenu = (p: P) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const IconX = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconChevron = (p: P) => <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>;
export const IconSpark = (p: P) => <svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>;
export const IconShield = (p: P) => <svg {...base(p)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
export const IconPlug = (p: P) => <svg {...base(p)}><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 01-10 0zM12 16v5" /></svg>;
export const IconBoard = (p: P) => <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16M15 4v16" /></svg>;
export const IconInbox = (p: P) => <svg {...base(p)}><path d="M3 13l2.5-7h13L21 13v5a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M3 13h5l1.5 2h5L16 13h5" /></svg>;
export const IconUsers = (p: P) => <svg {...base(p)}><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 4.5a3.2 3.2 0 010 7M21 20a6 6 0 00-4.5-5.8" /></svg>;
export const IconChart = (p: P) => <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const IconLock = (p: P) => <svg {...base(p)}><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 018 0v3" /></svg>;
export const IconBot = (p: P) => <svg {...base(p)}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6" /></svg>;
export const IconLayers = (p: P) => <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5M3 17l9 5 9-5" /></svg>;
export const IconFlow = (p: P) => <svg {...base(p)}><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6.5 7.5L11 16M17.5 7.5L13 16" /></svg>;
export const IconMail = (p: P) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 7l9 6 9-6" /></svg>;
export const IconGlobe = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
export const IconKey = (p: P) => <svg {...base(p)}><circle cx="8" cy="14" r="4" /><path d="M11 11l9-9M16 6l3 3M13 9l3 3" /></svg>;
export const IconWand = (p: P) => <svg {...base(p)}><path d="M4 20L15 9M15 4v2M19 8h2M17.5 5.5l1.5-1.5M12.5 5.5L11 4M19 11l1.5 1.5" /></svg>;
