import { describe, expect, it } from 'vitest';
import { defaultResume } from '@/resume/defaults';
import { applyDesignPreset } from '@/components/editor/DesignLab';
import { analyzeResumeHealth } from '@/frontend/ai/health';
import { resumeContextForSection } from '@/frontend/ai/text';

describe('Stage 5 design controls', () => {
  it('applies named presets to presentation settings without touching resume content', () => {
    const before = structuredClone(defaultResume);
    const updated = { ...before, settings: applyDesignPreset(before.settings, 'ATS Clean') };
    expect(updated.settings.template).toBe('ats');
    expect(updated.settings.font).toBe('arial');
    expect(updated.settings.bodySize).toBeGreaterThanOrEqual(15);
    expect(updated.personal).toEqual(before.personal);
    expect(updated.experience).toEqual(before.experience);
    expect(updated.profile).toEqual(before.profile);
  });

  it('leaves settings unchanged for unknown presets', () => {
    expect(applyDesignPreset(defaultResume.settings, 'Unknown')).toEqual(defaultResume.settings);
  });

  it('derives health from the current resume content without a hiring score', () => {
    const findings = analyzeResumeHealth(defaultResume);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.title && finding.explanation)).toBe(true);
  });

  it('sends only the requested section as Copilot context and strips personal details', () => {
    const context = resumeContextForSection(defaultResume, 'experience');
    expect(context.personal).toEqual({ name: '', title: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' });
    expect(context.experience).toEqual(defaultResume.experience);
    expect(context.profile.content).toEqual([]);
    expect(context.projects).toEqual([]);
    expect(context.id).toBe('copilot-context');
  });
});
