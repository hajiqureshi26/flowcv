import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './primitives.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
  children: ReactNode;
};

export function Button({ variant = 'secondary', loading = false, disabled, className = '', children, ...props }: Props) {
  return (
    <button
      {...props}
      className={`${styles.button} ${styles[variant]} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}
