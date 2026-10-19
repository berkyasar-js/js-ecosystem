'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Item { id: number; title: string; description?: string; origin?: HTMLElement }
interface Api { success(title: string, description?: string): void }
const Ctx = createContext<Api | null>(null);

/** Kalıcı, kapatılabilir bildirimler. Yalnızca sunucu/repo işlemi başarıyla çözüldükten sonra çağrılmalıdır; hatalar alan yanında satır içi gösterilir. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const next = useRef(0);
  const success = useCallback((title: string, description?: string) => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const id = ++next.current;
    setItems((cur) => [...cur.slice(-3), { id, title, description, origin }]);
    setAnnouncement(`${title}. ${description ?? ''}`);
  }, []);
  const api = useMemo<Api>(() => ({ success }), [success]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="orbit-work">
        <span role="status" aria-live="polite" aria-atomic="true" className="wk-sr">{announcement}</span>
        <section className="wk-toasts" aria-label="Bildirimler">
          {items.map((it) => (
            <div className="wk-toast" key={it.id}>
              <div><strong>{it.title}</strong>{it.description && <p>{it.description}</p>}</div>
              <button type="button" className="wk-ib" style={{ width: 28, height: 28 }} aria-label={`${it.title} bildirimini kapat`} onClick={() => {
                if (it.origin?.isConnected) it.origin.focus();
                setItems((cur) => cur.filter((x) => x.id !== it.id));
              }}><X size={14} aria-hidden /></button>
            </div>
          ))}
        </section>
      </div>
    </Ctx.Provider>
  );
}
export function useToast(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error('ToastProvider yok');
  return c;
}
