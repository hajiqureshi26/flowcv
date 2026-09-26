import type { Resume, SectionKey } from '@/resume/types';

/**
 * Structural rich-text keys (and entry ids) are control data rather than resume
 * content, so they are excluded from the plain-text projection.
 *
 * This mirrors `AIOrchestrator._flatten`/`_section_text` on the backend. The
 * backend rejects any selected text that is not part of the section it claims
 * to come from, so both sides must project the resume the same way.
 */
const STRUCTURAL_KEYS = new Set(['type', 'attrs', 'marks', 'id']);

export function flattenResumeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flattenResumeText).join(' ');
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !STRUCTURAL_KEYS.has(key))
      .map(([, item]) => flattenResumeText(item))
      .join(' ');
  }
  return '';
}

/** Plain-text projection of a single resume section, empty sections excluded. */
export function sectionPlainText(resume: Resume, section: SectionKey): string {
  const value = section === 'profile' ? resume.profile : resume[section];
  return flattenResumeText(value).replace(/\s+/g, ' ').trim();
}

/** Sections that currently hold content a user can ask the assistant to improve. */
export function improvableSections(resume: Resume): SectionKey[] {
  return (['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'] as SectionKey[])
    .filter((section) => sectionPlainText(resume, section).length > 0);
}
