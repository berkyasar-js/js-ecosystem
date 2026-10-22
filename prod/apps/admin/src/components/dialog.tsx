'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Yerel <dialog> sarmalayıcı. showModal() odak tuzağını, inert arka planı ve Escape'i tarayıcıdan alır;
 * kapanışta odak, açan öğeye geri döner. Dış durum (open) tek doğruluk kaynağıdır.
 * variant="sheet": mobilde alttan açılan panel (başlıksız; içerik kendi araç çubuğunu taşır).
 */
export function OrbitDialog({ open, onClose, title, description, children, actions, variant = 'modal', label }: {
  open: boolean; onClose: () => void; title?: string; description?: string; children: ReactNode; actions?: ReactNode; variant?: 'modal' | 'sheet'; label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => () => {
    const el = ref.current;
    if (el?.open) el.close();
  }, []);

  const restoreFocus = () => {
    const t = returnTo.current;
    returnTo.current = null;
    if (t?.isConnected) t.focus();
  };

  return (
    <dialog
      ref={ref}
      className="wk-dialog orbit-work"
      data-variant={variant}
      aria-labelledby={title ? `${id}-t` : undefined}
      aria-describedby={description ? `${id}-d` : undefined}
      aria-label={title ? undefined : label}
      onCancel={(e) => { e.preventDefault(); closeRef.current(); }}
      onClose={() => { if (open) closeRef.current(); restoreFocus(); }}
      onMouseDown={(e) => { if (e.target === ref.current) closeRef.current(); }}
    >
      {open && (
        <>
          {title && (
            <div className="wk-dialog-head">
              <h2 id={`${id}-t`}>{title}</h2>
              <button type="button" className="wk-ib" aria-label="Pencereyi kapat" onClick={() => closeRef.current()}><X size={18} aria-hidden /></button>
            </div>
          )}
          {description && <p id={`${id}-d`} className="wk-muted" style={{ padding: '12px 20px 0' }}>{description}</p>}
          {children}
          {actions && <div className="wk-dialog-actions">{actions}</div>}
        </>
      )}
    </dialog>
  );
}
