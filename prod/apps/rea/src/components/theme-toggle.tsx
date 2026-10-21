'use client';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(() => (typeof document === 'undefined' ? true : document.documentElement.dataset.theme !== 'light'));
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('js_theme', next); } catch { /* depolama kapalı */ }
    setDark(!dark);
  };
  return (
    <button type="button" className="btn icon-btn" onClick={toggle} aria-label={dark ? 'Açık temaya geç' : 'Koyu temaya geç'} title="Tema">
      {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
    </button>
  );
}
