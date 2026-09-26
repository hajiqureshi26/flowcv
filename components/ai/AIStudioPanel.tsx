'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { aiApi } from '@/frontend/api/client';
import { describeAIError, retryMessage, type AIErrorState } from '@/frontend/ai/errors';
import { applyResumeImproveSuggestion, applyTailoringSuggestion } from '@/frontend/ai/suggestions';
import { improvableSections, sectionPlainText } from '@/frontend/ai/text';
import type {
  AIProviderMetadata,
  AIResponse,
  ATSAnalysisResult,
  JDAnalysisResult,
  ResumeImproveResult,
  TailoringResult,
  TailoringSuggestion,
} from '@/frontend/ai/types';
import type { Resume, SectionKey } from '@/resume/types';
import { browserResumeStorage } from '@/storage/storageAdapter';
import { useResumeStore } from '@/store/resumeStore';

type TabId = 'assistant' | 'jd' | 'ats' | 'tailor';
type Operation = 'improve' | 'grammar' | 'clarity' | 'conciseness' | 'professional_wording';
type Status = 'idle' | 'loading' | 'success' | 'error';

type ActionState<T> = { status: Status; result: T | null; error: AIErrorState | null; retryAfter: number };

const TABS: { id: TabId; label: string }[] = [
  { id: 'assistant', label: 'Resume assistant' },
  { id: 'jd', label: 'Job description' },
  { id: 'ats', label: 'ATS report' },
  { id: 'tailor', label: 'Tailoring' },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  profile: 'Profile', experience: 'Experience', education: 'Education', projects: 'Projects',
  skills: 'Skills', certifications: 'Certifications', achievements: 'Achievements', links: 'Links', custom: 'Custom sections',
};

const OPERATIONS: { id: Operation; label: string }[] = [
  { id: 'improve', label: 'Improve overall' },
  { id: 'grammar', label: 'Fix grammar' },
  { id: 'clarity', label: 'Improve clarity' },
  { id: 'conciseness', label: 'Make concise' },
  { id: 'professional_wording', label: 'Professional wording' },
];

function idleState<T>(): ActionState<T> {
  return { status: 'idle', result: null, error: null, retryAfter: 0 };
}

/**
 * Runs one AI request and tracks loading, success and structured failure states.
 *
 * HTTP 429 responses carry a `Retry-After` delay from the backend rate limiter;
 * it is surfaced to the user as a countdown instead of an opaque error.
 */
function useAIAction<T>() {
  const [state, setState] = useState<ActionState<T>>(() => idleState<T>());
  const run = useCallback(async (action: () => Promise<T>) => {
    setState({ status: 'loading', result: null, error: null, retryAfter: 0 });
    try {
      const result = await action();
      setState({ status: 'success', result, error: null, retryAfter: 0 });
    } catch (error) {
      const described = describeAIError(error);
      setState({ status: 'error', result: null, error: described, retryAfter: described.retryAfterSeconds ?? 0 });
    }
  }, []);
  const reset = useCallback(() => setState(idleState<T>()), []);
  useEffect(() => {
    if (state.retryAfter <= 0) return;
    const timer = setTimeout(() => setState((previous) => (previous.retryAfter > 0 ? { ...previous, retryAfter: previous.retryAfter - 1 } : previous)), 1000);
    return () => clearTimeout(timer);
  }, [state.retryAfter]);
  return { state, run, reset, blocked: state.status === 'loading' || state.retryAfter > 0 };
}

function ProviderBadge({ provider }: { provider: AIProviderMetadata }) {
  return (
    <p className="ai-provider" data-testid="ai-provider">
      <span>{provider.name}</span> · {provider.model}
      {provider.fallback_used && <em> fallback</em>}
      {provider.cached && <em> cached</em>}
    </p>
  );
}

function Loading({ label }: { label: string }) {
  return <p className="ai-loading" role="status">{label}</p>;
}

function ErrorNotice({ error }: { error: AIErrorState }) {
  return (
    <p className="ai-error" role="alert" data-testid="ai-error">
      <strong>{error.kind === 'rate_limited' ? 'Rate limited' : 'AI unavailable'}</strong> {error.message}
    </p>
  );
}

function RateLimited({ seconds }: { seconds: number }) {
  return <p className="ai-retry" role="status" data-testid="ai-retry-after">{retryMessage(seconds)}</p>;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="ai-list">
      <h4>{title}</h4>
      <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul>
    </div>
  );
}

function JobDescriptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Job description
      <textarea
        aria-label="Job description"
        rows={6}
        value={value}
        placeholder="Paste the job posting you are targeting."
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export default function AIStudioPanel({ onClose }: { onClose: () => void }) {
  const { resume, update } = useResumeStore();
  const [tab, setTab] = useState<TabId>('assistant');
  const [jobDescription, setJobDescription] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>('improve');
  const [assistantDecision, setAssistantDecision] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});

  const sections = useMemo(() => improvableSections(resume), [resume]);
  const [requestedSection, setRequestedSection] = useState<SectionKey>('profile');
  const section = sections.includes(requestedSection) ? requestedSection : sections[0] ?? 'profile';
  const sectionText = sectionPlainText(resume, section);

  const assistant = useAIAction<AIResponse<ResumeImproveResult>>();
  const jd = useAIAction<AIResponse<JDAnalysisResult>>();
  const ats = useAIAction<AIResponse<ATSAnalysisResult>>();
  const tailor = useAIAction<AIResponse<TailoringResult>>();

  const assistantResult = assistant.state.result?.result ?? null;
  const jdResult = jd.state.result?.result ?? null;
  const atsResult = ats.state.result?.result ?? null;
  const tailoringResult = tailor.state.result?.result ?? null;

  /**
   * The only path that writes AI output into the resume: explicitly accepted
   * suggestions go through the existing Zustand store and IndexedDB persistence.
   */
  const commit = useCallback(async (next: Resume | null, message: string) => {
    if (!next) {
      setNotice('That suggestion no longer matches your resume, so nothing was changed.');
      return false;
    }
    update(() => next);
    await browserResumeStorage.save(useResumeStore.getState().resume);
    setNotice(message);
    return true;
  }, [update]);

  const acceptAssistant = async () => {
    if (!assistantResult) return;
    const next = applyResumeImproveSuggestion(useResumeStore.getState().resume, section, assistantResult.original, assistantResult.suggested);
    if (await commit(next, 'Suggestion accepted and saved on this device.')) setAssistantDecision('accepted');
  };

  const acceptTailoringSuggestion = async (suggestion: TailoringSuggestion) => {
    const next = applyTailoringSuggestion(useResumeStore.getState().resume, suggestion);
    if (await commit(next, 'Tailoring suggestion accepted and saved on this device.')) {
      setDecisions((previous) => ({ ...previous, [suggestion.id]: 'accepted' }));
    }
  };

  return (
    <div className="ai-backdrop" role="presentation" onClick={onClose}>
      <section
        className="ai-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AI studio"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ai-panel-head">
          <div>
            <p className="eyebrow">REVIEW FIRST</p>
            <h2>AI studio</h2>
          </div>
          <button className="ai-close" aria-label="Close AI studio" onClick={onClose}>Close</button>
        </header>
        <p className="ai-privacy">
          Anonymously rate-limited. Suggestions are proposals only: nothing is written to your resume unless you accept it,
          and your resume stays in this browser.
        </p>

        <div className="ai-tabs" role="tablist" aria-label="AI tools">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'chosen' : ''}
              onClick={() => { setTab(item.id); setNotice(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {notice && <p className="ai-notice" role="status">{notice}</p>}

        {tab === 'assistant' && (
          <div role="tabpanel" aria-label="Resume assistant tools" className="ai-body">
            <div className="ai-field-row">
              <label>
                Section to review
                <select
                  aria-label="Section to review"
                  value={section}
                  onChange={(event) => {
                    setRequestedSection(event.target.value as SectionKey);
                    setAssistantDecision('pending');
                    assistant.reset();
                  }}
                >
                  {sections.map((id) => <option key={id} value={id}>{SECTION_LABELS[id]}</option>)}
                </select>
              </label>
              <label>
                Improvement
                <select
                  aria-label="Improvement type"
                  value={operation}
                  onChange={(event) => {
                    setOperation(event.target.value as Operation);
                    setAssistantDecision('pending');
                    assistant.reset();
                  }}
                >
                  {OPERATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
            </div>
            <label>
              Text sent for review
              <textarea aria-label="Text sent for review" rows={4} readOnly value={sectionText} />
            </label>
            <button
              className="ai-primary"
              disabled={assistant.blocked || !sectionText}
              onClick={() => {
                setNotice(null);
                setAssistantDecision('pending');
                void assistant.run(() => aiApi.improveResume({ resume, section, content: sectionText, operation }));
              }}
            >
              Review suggestion
            </button>

            {assistant.state.status === 'loading' && <Loading label="Reviewing your section…" />}
            {assistant.state.error && <ErrorNotice error={assistant.state.error} />}
            {assistant.state.retryAfter > 0 && <RateLimited seconds={assistant.state.retryAfter} />}

            {assistantResult && assistantDecision === 'pending' && (
              <article className="ai-suggestion" data-testid="assistant-suggestion">
                <h3>Suggested wording</h3>
                <p className="ai-compare"><span>Before</span><del>{assistantResult.original}</del></p>
                <p className="ai-compare"><span>After</span><ins>{assistantResult.suggested}</ins></p>
                {assistantResult.rationale && <p className="ai-rationale">{assistantResult.rationale}</p>}
                <div className="ai-actions">
                  <button className="ai-primary" onClick={() => void acceptAssistant()}>Accept suggestion</button>
                  <button
                    className="ai-secondary"
                    onClick={() => {
                      setAssistantDecision('rejected');
                      setNotice('Suggestion rejected. Your resume was not changed.');
                    }}
                  >
                    Reject suggestion
                  </button>
                </div>
              </article>
            )}
            {assistantResult && assistantDecision !== 'pending' && (
              <p className="ai-decision" data-testid="assistant-decision">Suggestion {assistantDecision}. Your resume {assistantDecision === 'accepted' ? 'was updated and saved on this device.' : 'was left untouched.'}</p>
            )}
            {assistant.state.result && <ProviderBadge provider={assistant.state.result.provider} />}
          </div>
        )}

        {tab === 'jd' && (
          <div role="tabpanel" aria-label="Job description analysis" className="ai-body">
            <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
            <button
              className="ai-primary"
              disabled={jd.blocked || !jobDescription.trim()}
              onClick={() => { setNotice(null); void jd.run(() => aiApi.analyzeJobDescription(jobDescription)); }}
            >
              Analyze job description
            </button>
            {jd.state.status === 'loading' && <Loading label="Analyzing the job description…" />}
            {jd.state.error && <ErrorNotice error={jd.state.error} />}
            {jd.state.retryAfter > 0 && <RateLimited seconds={jd.state.retryAfter} />}
            {jdResult && (
              <div className="ai-report" data-testid="jd-report">
                {jdResult.job_title && <p className="ai-job-title"><strong>Role</strong> {jdResult.job_title}</p>}
                <ListBlock title="Required skills" items={jdResult.required_skills} />
                <ListBlock title="Preferred skills" items={jdResult.preferred_skills} />
                <ListBlock title="Technologies" items={jdResult.technologies} />
                <ListBlock title="Responsibilities" items={jdResult.responsibilities} />
                <ListBlock title="Experience requirements" items={jdResult.experience_requirements} />
                <ListBlock title="Education requirements" items={jdResult.education_requirements} />
                <ListBlock title="Keywords" items={jdResult.keywords} />
                <ListBlock title="ATS keywords" items={jdResult.ats_keywords} />
              </div>
            )}
            {jd.state.result && <ProviderBadge provider={jd.state.result.provider} />}
          </div>
        )}

        {tab === 'ats' && (
          <div role="tabpanel" aria-label="ATS report analysis" className="ai-body">
            <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
            <button
              className="ai-primary"
              disabled={ats.blocked || !jobDescription.trim()}
              onClick={() => { setNotice(null); void ats.run(() => aiApi.analyzeATS(resume, jobDescription)); }}
            >
              Run ATS analysis
            </button>
            <p className="ai-hint">This is a content review, not a guarantee of any ATS result.</p>
            {ats.state.status === 'loading' && <Loading label="Comparing your resume with the posting…" />}
            {ats.state.error && <ErrorNotice error={ats.state.error} />}
            {ats.state.retryAfter > 0 && <RateLimited seconds={ats.state.retryAfter} />}
            {atsResult && (
              <div className="ai-report" data-testid="ats-report">
                <ListBlock title="Matching skills" items={atsResult.matching_skills} />
                <ListBlock title="Missing relevant keywords" items={atsResult.missing_relevant_keywords} />
                <ListBlock title="Content issues" items={atsResult.content_issues} />
                <ListBlock title="Formatting and parsing concerns" items={atsResult.formatting_concerns} />
                <ListBlock title="Experience alignment" items={atsResult.experience_alignment} />
                <ListBlock title="Education alignment" items={atsResult.education_alignment} />
                <ListBlock title="Actionable suggestions" items={atsResult.actionable_suggestions} />
              </div>
            )}
            {ats.state.result && <ProviderBadge provider={ats.state.result.provider} />}
          </div>
        )}

        {tab === 'tailor' && (
          <div role="tabpanel" aria-label="Tailoring suggestions" className="ai-body">
            <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
            <button
              className="ai-primary"
              disabled={tailor.blocked || !jobDescription.trim()}
              onClick={() => {
                setNotice(null);
                setDecisions({});
                void tailor.run(() => aiApi.tailorResume(resume, jobDescription));
              }}
            >
              Suggest tailoring changes
            </button>
            <p className="ai-hint">Every suggestion must quote the resume text it replaces and the requirement it answers.</p>
            {tailor.state.status === 'loading' && <Loading label="Preparing tailoring suggestions…" />}
            {tailor.state.error && <ErrorNotice error={tailor.state.error} />}
            {tailor.state.retryAfter > 0 && <RateLimited seconds={tailor.state.retryAfter} />}
            {tailoringResult && tailor.state.status === 'success' && tailoringResult.suggestions.length === 0 && (
              <p className="ai-empty" role="status">No truthful changes were identified for this posting.</p>
            )}
            {tailoringResult && tailoringResult.suggestions.length > 0 && (
              <ol className="ai-suggestions" data-testid="tailoring-suggestions">
                {tailoringResult.suggestions.map((suggestion: TailoringSuggestion, index) => (
                  <li key={suggestion.id} data-decision={decisions[suggestion.id] ?? 'pending'}>
                    <p className="ai-suggestion-head">
                      <strong>{SECTION_LABELS[suggestion.section]}</strong>
                      {suggestion.entry_id && <span> · {suggestion.entry_id}</span>}
                    </p>
                    <p className="ai-compare"><span>Before</span><del>{suggestion.original_content}</del></p>
                    <p className="ai-compare"><span>After</span><ins>{suggestion.suggested_content}</ins></p>
                    <p className="ai-rationale">{suggestion.reason}</p>
                    <p className="ai-requirement">Job requirement: {suggestion.supporting_requirement}</p>
                    {decisions[suggestion.id] ? (
                      <p className="ai-decision" role="status">
                        Suggestion {decisions[suggestion.id]}. Your resume {decisions[suggestion.id] === 'accepted' ? 'was updated and saved on this device.' : 'was left untouched.'}
                      </p>
                    ) : (
                      <div className="ai-actions">
                        <button className="ai-primary" aria-label={`Accept suggestion ${index + 1}`} onClick={() => void acceptTailoringSuggestion(suggestion)}>Accept</button>
                        <button
                          className="ai-secondary"
                          aria-label={`Reject suggestion ${index + 1}`}
                          onClick={() => {
                            setDecisions((previous) => ({ ...previous, [suggestion.id]: 'rejected' }));
                            setNotice('Suggestion rejected. Your resume was not changed.');
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {tailor.state.result && <ProviderBadge provider={tailor.state.result.provider} />}
          </div>
        )}
      </section>
    </div>
  );
}

