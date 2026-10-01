'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { templateRegistry } from '@/templates/registry';
import { JourneyFooter, JourneyHeader } from '@/components/journey/SiteChrome';
import { defaultResume } from '@/resume/defaults';
import TemplateDocumentPreview from '@/components/templates/TemplateDocumentPreview';

const filters = ['All', 'ATS', 'Modern', 'Professional', 'Compact'];
export default function TemplatesPage() {
  const [filter, setFilter] = useState('All');
  const templates = useMemo(() => templateRegistry.filter(item => filter === 'All' || item.category === filter || (filter === 'Compact' && item.layout === 'compact')), [filter]);
  return <main className="journey-page gallery-page">
    <JourneyHeader />
    <section className="journey-container gallery-content">
      <p className="eyebrow">THE TEMPLATE COLLECTION</p><h1>Find your format.</h1>
      <p className="journey-lead">Choose a starting point. Your new resume opens separately, so your existing work stays safe.</p>
      <div className="template-filters" aria-label="Filter templates">{filters.map(name => <button key={name} className={filter === name ? 'chosen' : ''} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}</div>
      <div className="journey-template-grid">{templates.map(item => <Link className="journey-template-card" href={`/templates/${item.id}`} key={item.id}>
        <div className={`journey-template-sheet sheet-${item.id}`} aria-hidden="true"><TemplateDocumentPreview resume={defaultResume} template={item.id}/></div>
        <div><span className="journey-category">{item.category}{item.layout === 'compact' ? ' · Compact' : ''}</span><h2>{item.name}</h2><p>{item.capabilities.atsFriendly ? 'A clear, readable layout that works well with applicant tracking systems.' : 'A polished two-column layout with a distinct visual hierarchy.'}</p><span className="journey-link">View template <span aria-hidden="true">→</span></span></div>
      </Link>)}</div>
    </section>
    <JourneyFooter />
  </main>;
}
