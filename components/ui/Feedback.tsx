import type { HTMLAttributes, ReactNode } from 'react';
import styles from './primitives.module.css';

type Tone = 'info' | 'success' | 'warning' | 'error';
const toneClass: Record<Tone, string> = { info: styles.toneInfo, success: styles.toneSuccess, warning: styles.toneWarning, error: styles.toneError };
export function Alert({ tone = 'info', children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; children: ReactNode }) {
  return <div {...props} className={`${styles.alert} ${toneClass[tone]} ${className}`.trim()} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Toast({ tone = 'info', children, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; children: ReactNode }) {
  return <div {...props} className={`${styles.toast} ${toneClass[tone]} ${props.className ?? ''}`.trim()} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}>{children}</div>;
}

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} aria-hidden="true" className={`${styles.skeleton} ${className}`.trim()}/>;
}

export function Progress({ value, label, ...props }: HTMLAttributes<HTMLDivElement> & { value: number; label: string }) {
  const bounded = Math.min(100, Math.max(0, value));
  return <div {...props} className={`${styles.progress} ${props.className ?? ''}`.trim()} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}><span style={{ width: `${bounded}%` }}/></div>;
}

export function EmptyState({ title, children, className = '', ...props }: HTMLAttributes<HTMLElement> & { title: string; children?: ReactNode }) {
  return <section {...props} className={`${styles.empty} ${className}`.trim()}>
    <h3>{title}</h3>{children && <div>{children}</div>}
  </section>;
}
