import { describe, expect, it } from 'vitest';
import { analyzeResumeHealth } from '../frontend/ai/health';
import { defaultResume } from '../resume/defaults';

describe('deterministic Resume Health', () => {
  it('reports missing contact fields and empty core sections without inventing a score', () => {
    const resume = structuredClone(defaultResume);
    resume.personal.email = '';
    resume.personal.phone = '';
    resume.experience = [];
    resume.skills = [];

    const findings = analyzeResumeHealth(resume);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'critical', relatedField: 'personal.email' }),
      expect.objectContaining({ severity: 'warning', relatedField: 'experience' }),
      expect.objectContaining({ relatedField: 'skills' }),
    ]));
    expect(findings.some(finding => /score|probability/i.test(finding.title))).toBe(false);
  });

  it('flags invalid links and duplicate text', () => {
    const resume = structuredClone(defaultResume);
    resume.personal.website = 'not a url';
    resume.experience[0].description = 'A repeated accomplishment with enough detail to be flagged.';
    resume.experience[0].bullets = ['A repeated accomplishment with enough detail to be flagged.'];
    const findings = analyzeResumeHealth(resume);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Website URL looks invalid' }),
      expect.objectContaining({ title: 'Repeated text found' }),
    ]));
  });
});
