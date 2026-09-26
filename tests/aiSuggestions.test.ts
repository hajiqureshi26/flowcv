import { describe, expect, it } from 'vitest';

import { applyTailoringSuggestion } from '../frontend/ai/suggestions';
import { defaultResume } from '../resume/defaults';

describe('AI suggestion approval', () => {
  it('changes only the matching Resume entry after explicit acceptance', () => {
    const resume = structuredClone(defaultResume);
    const original = 'Lead product design for the core platform, from early discovery through launch.';
    const updated = applyTailoringSuggestion(resume, {
      id: 'suggestion-1',
      section: 'experience',
      entry_id: 'exp-1',
      original_content: original,
      suggested_content: 'Led core platform design from discovery through launch.',
      reason: 'Uses concise language.',
      supporting_requirement: 'Platform leadership',
    });

    expect(updated).not.toBeNull();
    expect(JSON.stringify(updated?.experience[0].description)).toContain('Led core platform design from discovery through launch.');
    expect(JSON.stringify(resume.experience[0].description)).toContain(original);
  });

  it('leaves the Resume untouched when no suggestion is applied', () => {
    const resume = structuredClone(defaultResume);
    const before = JSON.stringify(resume);
    const updated = applyTailoringSuggestion(resume, {
      id: 'suggestion-2',
      section: 'projects',
      entry_id: 'missing-project',
      original_content: 'Unsupported source text',
      suggested_content: 'A fabricated statement.',
      reason: 'Should not apply.',
      supporting_requirement: 'Anything',
    });

    expect(updated).toBeNull();
    expect(JSON.stringify(resume)).toBe(before);
  });
});