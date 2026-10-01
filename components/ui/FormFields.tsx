import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import styles from './primitives.module.css';

type Shared = { label: string; hint?: string; error?: string; className?: string; children?: ReactNode };
function FieldFrame({ id, label, hint, error, children }: Shared & { id: string }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return <>
    <span id={`${id}-label`}>{label}</span>
    {children}
    {hint && <span className={styles.hint} id={hintId}>{hint}</span>}
    {error && <span className={styles.fieldError} id={errorId}>{error}</span>}
  </>;
}

export function SelectField({ id, label, hint, error, className = '', children, ...props }: Shared & SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;
  return <label className={styles.field} htmlFor={fieldId}>
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <select {...props} id={fieldId} className={`${styles.input} ${styles.select} ${className}`.trim()} aria-labelledby={`${fieldId}-label`} aria-invalid={error ? true : undefined} aria-describedby={[hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined}>{children}</select>
    </FieldFrame>
  </label>;
}

export function TextareaField({ id, label, hint, error, className = '', ...props }: Shared & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;
  return <label className={styles.field} htmlFor={fieldId}>
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <textarea {...props} id={fieldId} className={`${styles.input} ${styles.textarea} ${className}`.trim()} aria-labelledby={`${fieldId}-label`} aria-invalid={error ? true : undefined} aria-describedby={[hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined}/>
    </FieldFrame>
  </label>;
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; hint?: string };
export function CheckboxField({ id, label, hint, className = '', ...props }: CheckboxProps) {
  const generatedId = useId();
  const fieldId = id ?? props.name ?? generatedId;
  return <div className={`${styles.checkboxField} ${className}`.trim()}>
    <label htmlFor={fieldId}><input {...props} id={fieldId} type="checkbox"/><span>{label}</span></label>
    {hint && <span className={styles.hint}>{hint}</span>}
  </div>;
}
