import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AIStudioPanel from '../components/ai/AIStudioPanel';
import { sectionPlainText } from '../frontend/ai/text';
import { defaultResume } from '../resume/defaults';
import { loadResume } from '../storage/indexedDb';
import { useResumeStore } from '../store/resumeStore';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status < 400,
  status,
  headers: new Headers(headers),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const envelope = (result: unknown) => ({
  result,
  provider: { name: 'gemini', model: 'gemini-2.5-flash', fallback_used: false, cached: false },
});

const PROFILE_TEXT = sectionPlainText(defaultResume, 'profile');
const EXPERIENCE_TEXT = 'Lead product design for the core platform, from early discovery through launch.';

function renderPanel() {
  render(<AIStudioPanel onClose={() => {}} />);
}

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('folio-resume-v1');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
  useResumeStore.getState().restore(structuredClone(defaultResume));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AI studio', () => {
  it('sends the selected section text and only writes the resume after acceptance', async () => {
    const suggested = 'Product designer with 6+ years of experience turning complex problems into clear, thoughtful digital products. I partner closely with research, product, and engineering to ship work that makes a measurable difference.';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(envelope({ original: PROFILE_TEXT, suggested, rationale: 'Names the shipped outcome.' })));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }));
    await screen.findByTestId('assistant-suggestion');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ section: 'profile', content: PROFILE_TEXT, operation: 'improve' });
    expect(screen.getByText('Names the shipped outcome.')).toBeInTheDocument();
    expect(sectionPlainText(useResumeStore.getState().resume, 'profile')).toBe(PROFILE_TEXT);
    expect((await loadResume()).personal.name).toBe(defaultResume.personal.name);

    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }));

    expect(await screen.findByTestId('assistant-decision')).toHaveTextContent('Suggestion accepted.');
    expect(sectionPlainText(useResumeStore.getState().resume, 'profile')).toBe(suggested);
    expect(sectionPlainText(await loadResume(), 'profile')).toBe(suggested);
  });

  it('leaves the resume and local storage untouched when the suggestion is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(envelope({ original: PROFILE_TEXT, suggested: 'Shorter profile.', rationale: 'Tighter.' }))));

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }));
    await screen.findByTestId('assistant-suggestion');
    fireEvent.click(screen.getByRole('button', { name: 'Reject suggestion' }));

    expect(await screen.findByTestId('assistant-decision')).toHaveTextContent('Suggestion rejected.');
    expect(screen.getByText('Suggestion rejected. Your resume was not changed.')).toBeInTheDocument();
    expect(sectionPlainText(useResumeStore.getState().resume, 'profile')).toBe(PROFILE_TEXT);
    expect(sectionPlainText(await loadResume(), 'profile')).toBe(PROFILE_TEXT);
  });

  it('shows the Retry-After countdown and blocks further requests when rate limited', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'AI request limit reached.' } }, 429, { 'Retry-After': '60' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }));

    expect(await screen.findByTestId('ai-error')).toHaveTextContent('Rate limited');
    expect(await screen.findByTestId('ai-retry-after')).toHaveTextContent('Try again in 60 seconds.');
    expect(screen.getByRole('button', { name: 'Review suggestion' })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a temporary provider outage without touching the resume', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'provider_unavailable', message: 'AI providers are temporarily unavailable' } }, 503)));

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }));

    expect(await screen.findByTestId('ai-error')).toHaveTextContent('AI unavailable');
    expect(screen.getByTestId('ai-error')).toHaveTextContent('temporarily unavailable');
    expect(sectionPlainText(useResumeStore.getState().resume, 'profile')).toBe(PROFILE_TEXT);
  });

  it('reports a validation error returned by the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'validation_error', message: 'Selected text must come from the specified resume section' } }, 422)));

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }));

    expect(await screen.findByTestId('ai-error')).toHaveTextContent('Selected text must come from the specified resume section');
  });

  it('shows a loading state while the request is in flight', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; })));

    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Review suggestion' }));

    expect(await screen.findByText('Reviewing your section…')).toBeInTheDocument();
    resolveRequest(jsonResponse(envelope({ original: PROFILE_TEXT, suggested: 'Shorter.', rationale: 'Tighter.' })));
    expect(await screen.findByTestId('assistant-suggestion')).toBeInTheDocument();
  });

  it('applies and persists an accepted tailoring suggestion', async () => {
    const tailoring = envelope({
      suggestions: [{
        id: 'suggestion-1',
        section: 'experience',
        entry_id: 'exp-1',
        original_content: EXPERIENCE_TEXT,
        suggested_content: 'Led core platform design from discovery through launch.',
        reason: 'Uses active, concise language.',
        supporting_requirement: 'Platform leadership',
      }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tailoring)));

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Tailoring' }));
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'We value platform leadership.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest tailoring changes' }));

    expect(await screen.findByTestId('tailoring-suggestions')).toBeInTheDocument();
    expect(screen.getByText('Job requirement: Platform leadership')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion 1' }));

    expect(await screen.findByText('Tailoring suggestion accepted and saved on this device.')).toBeInTheDocument();
    expect(JSON.stringify(useResumeStore.getState().resume.experience[0].description)).toContain('Led core platform design from discovery through launch.');
    expect(JSON.stringify((await loadResume()).experience[0].description)).toContain('Led core platform design from discovery through launch.');
  });

  it('keeps rejected tailoring suggestions out of the resume', async () => {
    const tailoring = envelope({
      suggestions: [{
        id: 'suggestion-2',
        section: 'projects',
        entry_id: 'proj-1',
        original_content: 'A community platform connecting neighbors with local food resources.',
        suggested_content: 'A community platform that scaled to every neighborhood.',
        reason: 'Adds scale.',
        supporting_requirement: 'community platform',
      }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(tailoring)));

    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Tailoring' }));
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'We run a community platform.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suggest tailoring changes' }));
    await screen.findByTestId('tailoring-suggestions');
    fireEvent.click(screen.getByRole('button', { name: 'Reject suggestion 1' }));

    expect(await screen.findByText('Suggestion rejected. Your resume was not changed.')).toBeInTheDocument();
    const stored = await loadResume();
    expect(JSON.stringify(stored.projects[0])).not.toContain('scaled to every neighborhood');
    expect(JSON.stringify(stored.projects[0])).toContain('connecting neighbors with local food resources');
  });

  it('renders structured job description and ATS reports', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(envelope({
        job_title: 'Senior Product Designer',
        required_skills: ['Design systems'],
        preferred_skills: ['Research'],
        technologies: ['Figma'],
        responsibilities: ['Lead design'],
        experience_requirements: ['5+ years'],
        education_requirements: [],
        keywords: ['accessibility'],
        ats_keywords: ['design system'],
      })))
      .mockResolvedValueOnce(jsonResponse(envelope({
        matching_skills: ['Design systems'],
        missing_relevant_keywords: ['accessibility audits'],
        content_issues: ['Profile omits outcomes'],
        formatting_concerns: ['None found'],
        experience_alignment: ['Aligned'],
        education_alignment: [],
        actionable_suggestions: ['Describe accessibility work'],
      }))));

    renderPanel();

    fireEvent.click(screen.getByRole('tab', { name: 'Job description' }));
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'Senior product designer role.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze job description' }));
    expect(await screen.findByTestId('jd-report')).toHaveTextContent('Senior Product Designer');
    expect(screen.getByText('Design systems')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'ATS report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run ATS analysis' }));
    expect(await screen.findByTestId('ats-report')).toHaveTextContent('accessibility audits');
    expect(screen.getByText(/not a guarantee of any ATS result/i)).toBeInTheDocument();
  });
});
