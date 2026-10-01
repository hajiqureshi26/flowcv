import type { HTMLAttributes, ReactNode } from 'react';
import styles from './primitives.module.css';

type SurfaceProps = HTMLAttributes<HTMLElement> & { children: ReactNode; as?: 'div' | 'section' | 'article'; padded?: boolean };
export function Surface({ as: Element = 'div', padded = true, className = '', children, ...props }: SurfaceProps) {
  return <Element {...props} className={`${styles.surface} ${padded ? styles.padded : ''} ${className}`.trim()}>{children}</Element>;
}
