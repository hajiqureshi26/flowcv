import { describe, expect, it } from 'vitest';

import { flattenResumeText, improvableSections, sectionPlainText } from '../frontend/ai/text';
import { defaultResume } from '../resume/defaults';

describe('resume text projection', () => {
  it('projects a rich text section to plain text without structural keys', () => {
    const text = sectionPlainText(defaultResume, 'profile');

    expect(text).toBe('Product designer with 6+ years of experience turning complex problems into clear, thoughtful digital experiences. I partner closely with research, product, and engineering to ship work that makes a measurable difference.');
    expect(text).not.toMatch(/\bdoc\b/);
    expect(text).not.toMatch(/\bparagraph\b/);
  });

  it('projects entries in field order and skips ids and boolean flags', () => {
    const text = sectionPlainText(defaultResume, 'experience');

    expect(text).toContain('Senior Product Designer Northstar New York, NY 2022 Present Lead product design for the core platform');
    expect(text).toContain('Redesigned onboarding and improved activation by 28%.');
    expect(text).not.toContain('exp-1');
  });

  it('ignores numbers, booleans, nulls and unknown values', () => {
    const text = flattenResumeText({ id: 'x', current: true, grade: null, count: 3, title: 'Analyst' });

    expect(text.split(/\s+/).filter(Boolean)).toEqual(['Analyst']);
  });

  it('lists only sections that hold content', () => {
    const sections = improvableSections(defaultResume);

    expect(sections[0]).toBe('profile');
    expect(sections).toContain('experience');
    expect(sections).not.toContain('custom');
    expect(improvableSections({ ...defaultResume, profile: { type: 'doc', content: [] } })).not.toContain('profile');
  });
});
