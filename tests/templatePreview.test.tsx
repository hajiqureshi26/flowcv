import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import TemplateDocumentPreview from '../components/templates/TemplateDocumentPreview';
import { defaultResume } from '../resume/defaults';

describe('template gallery document preview', () => {
  it('shows education location and dates in the editor grouping', () => {
    render(<TemplateDocumentPreview resume={defaultResume} template="ats" />);

    const metadata = [...document.querySelectorAll('.resume-entry .entry-sub')];
    expect(metadata.some(node => node.textContent?.includes('Parsons School of Design | New York, NY'))).toBe(true);
    expect(screen.getByText('2015 - 2019')).toBeInTheDocument();
  });

  it('uses configured page margin and skills layout', () => {
    const resume = {
      ...defaultResume,
      skills: [{ id: 'skill-test', category: 'Languages', items: ['Python', 'TypeScript'] }],
      settings: { ...defaultResume.settings, margin: 22, skillsLayout: 'grouped' as const },
    };
    const { container } = render(<TemplateDocumentPreview resume={resume} template="modern" />);

    expect(container.querySelector('.live-template-paper')).toHaveStyle({ padding: '22mm' });
    expect(screen.getByText('Python, TypeScript')).toBeInTheDocument();
  });
});
