import Link from 'next/link';
export default function TemplateNotFound() {
  return <main className="journey-page template-missing"><section><p className="eyebrow">TEMPLATE NOT FOUND</p><h1>We couldn&apos;t find that design.</h1><p>It may have moved, or the link may be incomplete.</p><Link className="journey-button journey-button-primary" href="/templates">Browse templates →</Link></section></main>;
}
