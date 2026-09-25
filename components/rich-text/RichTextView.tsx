import type { ReactNode } from 'react';
import type { RichText, RichTextNode } from '@/resume/types';

function renderNode(node: RichTextNode, key: string): ReactNode {
  if (node.type === 'text') {
    let value: ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') value = <strong key={`${key}-b`}>{value}</strong>;
      if (mark.type === 'italic') value = <em key={`${key}-i`}>{value}</em>;
      if (mark.type === 'underline') value = <u key={`${key}-u`}>{value}</u>;
      if (mark.type === 'link' && mark.attrs?.href) {
        const href = String(mark.attrs.href);
        if (/^(https?:\/\/|mailto:)/i.test(href)) value = <a key={`${key}-a`} href={href} rel="noreferrer">{value}</a>;
      }
    }
    return value;
  }
  const children = (node.content ?? []).map((child, i) => renderNode(child, `${key}-${i}`));
  switch (node.type) {
    case 'paragraph': return <p key={key}>{children}</p>;
    case 'bulletList': return <ul key={key}>{children}</ul>;
    case 'orderedList': return <ol key={key}>{children}</ol>;
    case 'listItem': return <li key={key}>{children}</li>;
    case 'hardBreak': return <br key={key}/>;
    case 'blockquote': return <blockquote key={key}>{children}</blockquote>;
    default: return <span key={key}>{children}</span>;
  }
}
export default function RichTextView({value}:{value:RichText}) { return <>{value.content.map((node,i)=>renderNode(node,String(i)))}</>; }
export function richTextIsEmpty(value:RichText) { const hasText=(node:RichTextNode):boolean=>Boolean(node.text?.trim())||(node.content??[]).some(hasText);return !value.content.some(hasText); }
