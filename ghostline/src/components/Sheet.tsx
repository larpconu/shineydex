import { useEffect, useRef, type ReactNode } from 'react';

/** Bottom sheet: spring slide-up, grab handle, blurred backdrop, swipe down to close. */
export function Sheet({ open, onClose, title, lead, children }: { open: boolean; onClose: () => void; title: string; lead?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onTouchStart={(e) => { if ((ref.current?.scrollTop ?? 0) <= 0) startY.current = e.touches[0].clientY; }}
        onTouchMove={(e) => {
          if (startY.current == null || !ref.current) return;
          const dy = e.touches[0].clientY - startY.current;
          if (dy > 0) ref.current.style.transform = `translateY(${dy}px)`;
        }}
        onTouchEnd={(e) => {
          if (startY.current == null || !ref.current) return;
          const dy = e.changedTouches[0].clientY - startY.current;
          startY.current = null;
          ref.current.style.transform = '';
          if (dy > 90) onClose();
        }}
      >
        <div className="grab" />
        <h3>{title}</h3>
        {lead && <p className="lead">{lead}</p>}
        {children}
      </div>
    </>
  );
}
