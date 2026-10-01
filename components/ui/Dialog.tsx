'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './primitives.module.css';

type Props = { titleId: string; label?: string; onClose: () => void; children: ReactNode; className?: string; placement?: 'center' | 'end' };

export function Dialog({ titleId, label, onClose, children, className = '', placement = 'center' }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = dialogRef.current;
    const focusable = () => root?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') ?? [];
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = [...focusable()];
      if (!items.length) { event.preventDefault(); return; }
      if (!items.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0])?.focus(); }
      else if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previousFocus.current?.focus(); };
  }, []);
  return <div className={`${styles.backdrop} ${placement === 'end' ? styles.endBackdrop : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className={`${styles.dialog} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={label} tabIndex={-1}>{children}</section>
  </div>;
}
