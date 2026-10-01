import { useId, type InputHTMLAttributes } from 'react';
import styles from './primitives.module.css';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export function TextField({ id, label, error, hint, className = '', ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const labelId = `${inputId}-label`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <label className={styles.field} htmlFor={inputId}>
      <span id={labelId}>{label}</span>
      <input {...props} id={inputId} className={`${styles.input} ${className}`.trim()} aria-labelledby={labelId} aria-invalid={error ? true : undefined} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} />
      {hint && <span className={styles.hint} id={hintId}>{hint}</span>}
      {error && <span className={styles.fieldError} id={errorId}>{error}</span>}
    </label>
  );
}
