import { cloneElement, useId, type ReactElement } from 'react';
import styles from './primitives.module.css';

type DescribedElement = ReactElement<{ 'aria-describedby'?: string }>;
export function Tooltip({ content, children }: { content: string; children: DescribedElement }) {
  const id = useId();
  const existing = children.props['aria-describedby'];
  return <span className={styles.tooltipAnchor}>
    {cloneElement(children, { 'aria-describedby': [existing, id].filter(Boolean).join(' ') })}
    <span id={id} role="tooltip" className={styles.tooltip}>{content}</span>
  </span>;
}
