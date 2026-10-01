'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi } from '@/frontend/api/client';
import { describeAIError, retryMessage, type AIErrorState } from '@/frontend/ai/errors';
import { applyResumeImproveSuggestion, applyTailoringSuggestion } from '@/frontend/ai/suggestions';
import { improvableSections, resumeContextForSection, sectionPlainText } from '@/frontend/ai/text';
import type {
  AIProviderMetadata,
  AIResponse,
  ATSAnalysisResult,
  JDAnalysisResult,
  ResumeImproveResult,
  ResumeHealthResult,
  TailoringResult,
  TailoringSuggestion,
} from '@/frontend/ai/types';
import type { Resume, SectionKey } from '@/resume/types';
import { browserResumeStorage } from '@/storage/storageAdapter';
import { useResumeStore } from '@/store/resumeStore';
import { Dialog } from '@/components/ui/Dialog';
import { SelectField, TextareaField } from '@/components/ui/FormFields';
import { Alert } from '@/components/ui/Feedback';
import { analyzeResumeHealth } from '@/frontend/ai/health';
import { resumeSchema } from '@/resume/schema';

type TabId = 'health' | 'job' | 'assistant' | 'jd' | 'ats' | 'tailor';
type Operation = 'improve' | 'grammar' | 'clarity' | 'conciseness' | 'professional_wording';
type Status = 'idle' | 'loading' | 'success' | 'error';

type ActionState<T> = { status: Status; result: T | null; error: AIErrorState | null; retryAfter: number; inputKey: string | null };

const TABS: { id: TabId; label: string }[] = [
  { id: 'health', label: 'Resume health' },
  { id: 'job', label: 'Job mode' },
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
  return { status: 'idle', result: null, error: null, retryAfter: 0, inputKey: null };
}

/**
 * Runs one AI request and tracks loading, success and structured failure states.
 *
 * HTTP 429 responses carry a `Retry-After` delay from the backend rate limiter;
 * it is surfaced to the user as a countdown instead of an opaque error.
 */
function useAIAction<T>() {
  const [state, setState] = useState<ActionState<T>>(() => idleState<T>());
  const run = useCallback(async (action: () => Promise<T>, inputKey: string) => {
    setState({ status: 'loading', result: null, error: null, retryAfter: 0, inputKey });
    try {
      const result = await action();
      setState({ status: 'success', result, error: null, retryAfter: 0, inputKey });
    } catch (error) {
      const described = describeAIError(error);
      setState({ status: 'error', result: null, error: described, retryAfter: described.retryAfterSeconds ?? 0, inputKey });
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
  return <Alert className="ai-loading">{label}</Alert>;
}

function ErrorNotice({ error }: { error: AIErrorState }) {
  return (
    <Alert tone="error" className="ai-error" data-testid="ai-error">
      <strong>{error.kind === 'rate_limited' ? 'Rate limited' : 'AI unavailable'}</strong> {error.message}
    </Alert>
  );
}

function RateLimited({ seconds }: { seconds: number }) {
  return <Alert tone="warning" className="ai-retry" data-testid="ai-retry-after">{retryMessage(seconds)}</Alert>;
}

function ListBlock({ title, items = [] }: { title: string; items?: string[] }) {
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
    <TextareaField
      label="Job description"
      name="job-description"
      rows={6}
      value={value}
      placeholder="Paste the job posting you are targeting."
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SuggestionList({ suggestions, decisions, onAccept, onReject }: {
  suggestions: TailoringSuggestion[];
  decisions: Record<string, 'accepted' | 'rejected'>;
  onAccept: (suggestion: TailoringSuggestion) => void;
  onReject: (id: string) => void;
}) {
  if (!suggestions.length) return <p className="ai-empty" role="status">No truthful changes were identified for this posting.</p>;
  return <ol className="ai-suggestions" data-testid="tailoring-suggestions">
    {suggestions.map((suggestion, index) => <li key={suggestion.id} data-decision={decisions[suggestion.id] ?? 'pending'}>
      <p className="ai-suggestion-head"><strong>{SECTION_LABELS[suggestion.section]}</strong>{suggestion.entry_id && <span> · {suggestion.entry_id}</span>}</p>
      <p className="ai-compare"><span>Before</span><del>{suggestion.original_content}</del></p>
      <p className="ai-compare"><span>After</span><ins>{suggestion.suggested_content}</ins></p>
      <p className="ai-rationale">{suggestion.reason}</p><p className="ai-requirement">Job requirement: {suggestion.supporting_requirement}</p>
      {decisions[suggestion.id] ? <p className="ai-decision" role="status">Suggestion {decisions[suggestion.id]}. Your resume {decisions[suggestion.id] === 'accepted' ? 'was updated and saved on this device.' : 'was left untouched.'}</p> : <div className="ai-actions">
        <button className="ai-primary" aria-label={`Accept suggestion ${index + 1}`} onClick={() => onAccept(suggestion)}>Accept</button>
        <button className="ai-secondary" aria-label={`Reject suggestion ${index + 1}`} onClick={() => onReject(suggestion.id)}>Reject</button>
      </div>}
    </li>)}
  </ol>;
}

export type AIAnalysisState = { jdAttached: boolean; jdAnalyzed: boolean; atsAnalyzed: boolean; stale: boolean; pendingSuggestion: boolean };
export default function AIStudioPanel({ onClose, resumeId = 'active', initialContent = '', initialTab = 'assistant', onAnalysisState }: { onClose: () => void; resumeId?: string; initialContent?: string; initialTab?: TabId; onAnalysisState?: (state: AIAnalysisState) => void }) {
  const { resume, update } = useResumeStore();
  const sections = useMemo(() => improvableSections(resume), [resume]);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [jobDescription, setJobDescription] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation>('improve');
  const [assistantDecision, setAssistantDecision] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [decisions, setDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [textDraft, setTextDraft] = useState<{ section: SectionKey; source: string; value: string } | null>(null);
  const textReviewRef = useRef<HTMLTextAreaElement | null>(null);
  const [assistantContent, setAssistantContent] = useState('');

  const [requestedSection, setRequestedSection] = useState<SectionKey>(() => sections.find((id) => sectionPlainText(resume, id).includes(initialContent)) ?? 'profile');
  const section = sections.includes(requestedSection) ? requestedSection : sections[0] ?? 'profile';
  const sectionText = sectionPlainText(resume, section);
  const resumeKey = JSON.stringify(resume);
  const jdKey = JSON.stringify(jobDescription.trim());
  const jobKey = JSON.stringify([resume, jobDescription.trim()]);
  const healthFindings = useMemo(() => analyzeResumeHealth(resume), [resume]);
  const selectedText = textDraft?.section === section && textDraft.source === sectionText ? textDraft.value : initialContent && sectionText.includes(initialContent) ? initialContent : sectionText;

  const assistant = useAIAction<AIResponse<ResumeImproveResult>>();
  const healthAI = useAIAction<AIResponse<ResumeHealthResult>>();
  const jd = useAIAction<AIResponse<JDAnalysisResult>>();
  const ats = useAIAction<AIResponse<ATSAnalysisResult>>();
  const tailor = useAIAction<AIResponse<TailoringResult>>();

  const assistantResult = assistant.state.result?.result ?? null;
  const jdResult = jd.state.result?.result ?? null;
  const atsResult = ats.state.result?.result ?? null;
  const tailoringResult = tailor.state.result?.result ?? null;
  const assistantStale = Boolean(assistant.state.inputKey && assistant.state.inputKey !== resumeKey);
  const healthStale = Boolean(healthAI.state.inputKey && healthAI.state.inputKey !== resumeKey);
  const jdStale = Boolean(jd.state.inputKey && jd.state.inputKey !== jdKey);
  const atsStale = Boolean(ats.state.inputKey && ats.state.inputKey !== jobKey);
  const tailorStale = Boolean(tailor.state.inputKey && tailor.state.inputKey !== jobKey);
  useEffect(() => onAnalysisState?.({ jdAttached: Boolean(jobDescription.trim()), jdAnalyzed: Boolean(jdResult), atsAnalyzed: Boolean(atsResult), stale: jdStale || atsStale || tailorStale || assistantStale, pendingSuggestion: Boolean(assistantResult && assistantDecision === 'pending') }), [onAnalysisState, jobDescription, jdResult, atsResult, jdStale, atsStale, tailorStale, assistantStale, assistantResult, assistantDecision]);

  /**
   * The only path that writes AI output into the resume: explicitly accepted
   * suggestions go through the existing Zustand store and IndexedDB persistence.
   */
  const commit = useCallback(async (next: Resume | null, message: string) => {
    if (!next) {
      setNotice('That suggestion no longer matches your resume, so nothing was changed.');
      return false;
    }
    const checked = resumeSchema.safeParse(next);
    if (!checked.success) {
      setNotice('This suggestion did not pass resume validation, so nothing was changed.');
      return false;
    }
    update(() => checked.data as Resume);
    await browserResumeStorage.save(useResumeStore.getState().resume, resumeId);
    setNotice(message);
    return true;
  }, [update, resumeId]);

  const acceptAssistant = async () => {
    if (!assistantResult || assistantStale) return;
    const next = applyResumeImproveSuggestion(useResumeStore.getState().resume, section, assistantResult.original, assistantResult.suggested);
    if (await commit(next, 'Suggestion accepted and saved on this device.')) setAssistantDecision('accepted');
  };

  const acceptTailoringSuggestion = async (suggestion: TailoringSuggestion) => {
    if (tailorStale) return;
    const next = applyTailoringSuggestion(useResumeStore.getState().resume, suggestion);
    if (await commit(next, 'Tailoring suggestion accepted and saved on this device.')) {
      setDecisions((previous) => ({ ...previous, [suggestion.id]: 'accepted' }));
    }
  };

  return (
    <Dialog titleId="ai-studio-title" onClose={onClose} className="ai-panel" placement="end">
        <header className="ai-panel-head">
          <div>
            <p className="eyebrow">REVIEW FIRST</p>
            <p className="eyebrow">CONTEXTUAL COPILOT</p>
            <h2 id="ai-studio-title">AI studio</h2>
          </div>
          <button className="ai-close" aria-label="Close AI studio" onClick={onClose}>Close</button>
        </header>
        <p className="ai-privacy">
          Anonymously rate-limited. Suggestions are proposals only: nothing is written to your resume unless you accept it,
          and your resume stays in this browser.
        </p>

        <div className="ai-tabs" role="tablist" aria-label="AI tools">
          {TABS.map((item, index) => (
            <button
              key={item.id}
              role="tab"
              id={`ai-tab-${item.id}`}
              aria-controls={`ai-panel-${item.id}`}
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? 'chosen' : ''}
              onKeyDown={(event) => {
                const targetIndex = event.key === 'ArrowRight' ? (index + 1) % TABS.length
                  : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length
                    : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
                if (targetIndex < 0) return;
                event.preventDefault();
                const target = TABS[targetIndex];
                setTab(target.id);
                setNotice(null);
                document.getElementById(`ai-tab-${target.id}`)?.focus();
              }}
              onClick={() => { setTab(item.id); setNotice(null); }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {notice && <p className="ai-notice" role="status">{notice}</p>}

        {tab === 'health' && (
          <div role="tabpanel" id="ai-panel-health" aria-labelledby="ai-tab-health" tabIndex={0} className="ai-body" data-testid="resume-health-report">
            <p className="ai-hint">Rule-based checks for completeness and structure. Findings are guidance, not a hiring or ATS score.</p>
            <button className="ai-primary" disabled={healthAI.blocked} onClick={() => void healthAI.run(() => aiApi.analyzeResumeHealth(resume), resumeKey)}>Add AI wording review</button>
            {healthAI.state.status === 'loading' && <Loading label="Reviewing clarity and readability…" />}
            {healthAI.state.error && <ErrorNotice error={healthAI.state.error} />}{healthAI.state.retryAfter > 0 && <RateLimited seconds={healthAI.state.retryAfter} />}
            {healthStale && <Alert tone="warning">This review is outdated because your resume changed. Run it again.</Alert>}
            {healthFindings.map((finding) => <article className={`health-finding severity-${finding.severity}`} key={finding.id}>
              <p>{finding.severity} · {finding.location}</p><h3>{finding.title}</h3><p>{finding.explanation}</p>
              <p><strong>Suggested next step:</strong> {finding.recommendation}</p>
            </article>)}
            {healthAI.state.result && !healthStale && healthAI.state.result.result.findings.map(finding => <article className={`health-finding severity-${finding.severity}`} key={`ai-${finding.id}`}>
              <p>AI review · {finding.category} · {finding.location}</p><h3>{finding.title}</h3><p>{finding.explanation}</p>
              <p><strong>Suggested next step:</strong> {finding.recommendation}</p>
            </article>)}
            {healthAI.state.result && <ProviderBadge provider={healthAI.state.result.provider} />}
          </div>
        )}

        {tab === 'job' && (
          <div role="tabpanel" id="ai-panel-job" aria-labelledby="ai-tab-job" tabIndex={0} className="ai-body" data-testid="job-mode">
            <p className="ai-hint">Analyze the posting, compare this resume, then review supported wording changes. Your resume changes only after you accept a suggestion.</p>
            <ol className="job-steps">
              <li><strong>1. Analyze the job description</strong>
                <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
                <button className="ai-primary" disabled={jd.blocked || !jobDescription.trim()} onClick={() => void jd.run(() => aiApi.analyzeJobDescription(jobDescription), jdKey)}>Analyze job description</button>
                {jd.state.status === 'loading' && <Loading label="Analyzing the job description…" />}
                {jd.state.error && <ErrorNotice error={jd.state.error} />}{jd.state.retryAfter > 0 && <RateLimited seconds={jd.state.retryAfter} />}
                {jdStale && jdResult && <Alert tone="warning">This analysis is outdated because the job description changed. Analyze it again.</Alert>}
                {jdResult && !jdStale && <div className="ai-report">{jdResult.job_title && <p><strong>Role:</strong> {jdResult.job_title}</p>}<ListBlock title="Required skills" items={jdResult.required_skills} /><ListBlock title="Preferred skills" items={jdResult.preferred_skills} /><ListBlock title="Technologies" items={jdResult.technologies} /><ListBlock title="Responsibilities" items={jdResult.responsibilities} /><ListBlock title="Experience requirements" items={jdResult.experience_requirements} /><ListBlock title="Education requirements" items={jdResult.education_requirements} /><ListBlock title="Certification requirements" items={jdResult.certification_requirements} /><ListBlock title="Keywords" items={jdResult.keywords} /><ListBlock title="Role and domain signals" items={jdResult.domain_signals} /></div>}
              </li>
              <li><strong>2. Match resume to requirements</strong>
                <button className="ai-primary" disabled={!jdResult || jdStale || ats.blocked || !jobDescription.trim()} onClick={() => void ats.run(() => aiApi.analyzeATS(resume, jobDescription), jobKey)}>Match resume</button>
                {ats.state.status === 'loading' && <Loading label="Comparing resume evidence with requirements…" />}
                {ats.state.error && <ErrorNotice error={ats.state.error} />}{ats.state.retryAfter > 0 && <RateLimited seconds={ats.state.retryAfter} />}
                {atsStale && atsResult && <Alert tone="warning">This match is outdated because the resume or job description changed. Run the match again.</Alert>}
                {atsResult && !atsStale && <div className="ai-report"><ListBlock title="Matched requirements" items={atsResult.matched_requirements} /><ListBlock title="Missing requirements" items={atsResult.missing_requirements} /><ListBlock title="Matched skills" items={atsResult.matching_skills} /><ListBlock title="Weak evidence · listed, but not shown in experience" items={atsResult.weak_evidence} /><ListBlock title="Relevant terms not detected in resume text" items={atsResult.missing_relevant_keywords} /><ListBlock title="Experience alignment" items={atsResult.experience_alignment} /><ListBlock title="Education alignment" items={atsResult.education_alignment} /><ListBlock title="Content issues" items={atsResult.content_issues} /><ListBlock title="Formatting concerns" items={atsResult.formatting_concerns} /><ListBlock title="Recommendations" items={atsResult.actionable_suggestions} /></div>}
              </li>
              <li><strong>3. Review tailoring suggestions</strong>
                <button className="ai-primary" disabled={!atsResult || atsStale || tailor.blocked} onClick={() => { setDecisions({}); void tailor.run(() => aiApi.tailorResume(resume, jobDescription), jobKey); }}>Prepare suggestions</button>
                {tailor.state.status === 'loading' && <Loading label="Preparing suggestions for review…" />}
                {tailor.state.error && <ErrorNotice error={tailor.state.error} />}{tailor.state.retryAfter > 0 && <RateLimited seconds={tailor.state.retryAfter} />}
                {tailorStale && tailoringResult && <Alert tone="warning">These suggestions are outdated because the resume or job description changed. Prepare them again.</Alert>}
              </li>
            </ol>
            {tailoringResult && !tailorStale && <SuggestionList suggestions={tailoringResult.suggestions} decisions={decisions} onAccept={suggestion => void acceptTailoringSuggestion(suggestion)} onReject={id => { setDecisions(previous => ({ ...previous, [id]: 'rejected' })); setNotice('Suggestion rejected. Your resume was not changed.'); }} />}
          </div>
        )}

        {tab === 'assistant' && (
          <div role="tabpanel" id="ai-panel-assistant" aria-labelledby="ai-tab-assistant" tabIndex={0} className="ai-body">
            <div className="ai-field-row">
              <SelectField
                  label="Section to review"
                  value={section}
                  onChange={(event) => {
                    setRequestedSection(event.target.value as SectionKey);
                    setAssistantDecision('pending');
                    assistant.reset();
                  }}
                >
                  {sections.map((id) => <option key={id} value={id}>{SECTION_LABELS[id]}</option>)}
              </SelectField>
              <SelectField
                  label="Improvement"
                  name="improvement-type"
                  value={operation}
                  onChange={(event) => {
                    setOperation(event.target.value as Operation);
                    setAssistantDecision('pending');
                    assistant.reset();
                  }}
                >
                  {OPERATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </SelectField>
            </div>
            <label>
              Text sent for review <span className="ai-hint">Select a phrase before requesting a change, or leave the current text selected.</span>
              <textarea ref={textReviewRef} aria-label="Text sent for review" rows={4} value={selectedText} onChange={event => setTextDraft({ section, source: sectionText, value: event.target.value })} />
            </label>
            <button
              className="ai-primary"
              disabled={assistant.blocked || !selectedText.trim()}
              onClick={() => {
                setNotice(null);
                setAssistantDecision('pending');
                const field = textReviewRef.current;
                const selection = field?.value.slice(field.selectionStart, field.selectionEnd).trim() ?? '';
                const content = selection || selectedText;
                setAssistantContent(content);
                void assistant.run(() => aiApi.improveResume({ resume: resumeContextForSection(resume, section), section, content, operation }), resumeKey);
              }}
            >
              Review suggestion
            </button>

            {assistant.state.status === 'loading' && <Loading label="Reviewing your section…" />}
            {assistant.state.error && <ErrorNotice error={assistant.state.error} />}
            {assistant.state.retryAfter > 0 && <RateLimited seconds={assistant.state.retryAfter} />}
            {assistantStale && assistantResult && <Alert tone="warning">This suggestion is outdated because your resume changed. Review the current text again.</Alert>}

            {assistantResult && assistantDecision === 'pending' && (
              <article className="ai-suggestion" data-testid="assistant-suggestion">
                <h3>Suggested wording</h3>
                <p className="ai-compare"><span>Before</span><del>{assistantContent || assistantResult.original}</del></p>
                <p className="ai-compare"><span>After</span><ins>{assistantResult.suggested}</ins></p>
                {assistantResult.rationale && <p className="ai-rationale">{assistantResult.rationale}</p>}
                <div className="ai-actions">
                  <button className="ai-primary" disabled={assistantStale} onClick={() => void acceptAssistant()}>Accept suggestion</button>
                  <button className="ai-secondary" type="button" onClick={() => void navigator.clipboard?.writeText(assistantResult.suggested)}>Copy</button>
                  <button className="ai-secondary" type="button" disabled={assistant.blocked} onClick={() => { setAssistantDecision('pending'); void assistant.run(() => aiApi.improveResume({ resume: resumeContextForSection(resume, section), section, content: assistantContent || assistantResult.original, operation }), resumeKey); }}>Regenerate</button>
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
          <div role="tabpanel" id="ai-panel-jd" aria-labelledby="ai-tab-jd" tabIndex={0} className="ai-body">
            <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
            <button
              className="ai-primary"
              disabled={jd.blocked || !jobDescription.trim()}
              onClick={() => { setNotice(null); void jd.run(() => aiApi.analyzeJobDescription(jobDescription), jdKey); }}
            >
              Analyze job description
            </button>
            {jd.state.status === 'loading' && <Loading label="Analyzing the job description…" />}
            {jd.state.error && <ErrorNotice error={jd.state.error} />}
            {jd.state.retryAfter > 0 && <RateLimited seconds={jd.state.retryAfter} />}
            {jdStale && jdResult && <Alert tone="warning">This analysis is outdated because the job description changed. Analyze it again.</Alert>}
            {jdResult && (
              <div className="ai-report" data-testid="jd-report">
                {jdResult.job_title && <p className="ai-job-title"><strong>Role</strong> {jdResult.job_title}</p>}
                <ListBlock title="Required skills" items={jdResult.required_skills} />
                <ListBlock title="Preferred skills" items={jdResult.preferred_skills} />
                <ListBlock title="Technologies" items={jdResult.technologies} />
                <ListBlock title="Responsibilities" items={jdResult.responsibilities} />
                <ListBlock title="Experience requirements" items={jdResult.experience_requirements} />
                <ListBlock title="Education requirements" items={jdResult.education_requirements} />
                <ListBlock title="Certification requirements" items={jdResult.certification_requirements} />
                <ListBlock title="Keywords" items={jdResult.keywords} />
                <ListBlock title="ATS keywords" items={jdResult.ats_keywords} />
                <ListBlock title="Role and domain signals" items={jdResult.domain_signals} />
              </div>
            )}
            {jd.state.result && <ProviderBadge provider={jd.state.result.provider} />}
          </div>
        )}

        {tab === 'ats' && (
          <div role="tabpanel" id="ai-panel-ats" aria-labelledby="ai-tab-ats" tabIndex={0} className="ai-body">
            <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
            <button
              className="ai-primary"
              disabled={ats.blocked || !jobDescription.trim()}
              onClick={() => { setNotice(null); void ats.run(() => aiApi.analyzeATS(resume, jobDescription), jobKey); }}
            >
              Run ATS analysis
            </button>
            <p className="ai-hint">This is a content review, not a guarantee of any ATS result.</p>
            {ats.state.status === 'loading' && <Loading label="Comparing your resume with the posting…" />}
            {ats.state.error && <ErrorNotice error={ats.state.error} />}
            {ats.state.retryAfter > 0 && <RateLimited seconds={ats.state.retryAfter} />}
            {atsStale && atsResult && <Alert tone="warning">This analysis is outdated because the resume or job description changed. Run it again.</Alert>}
            {atsResult && (
              <div className="ai-report" data-testid="ats-report">
                <ListBlock title="Matching skills" items={atsResult.matching_skills} />
                <ListBlock title="Matched requirements" items={atsResult.matched_requirements} />
                <ListBlock title="Missing requirements" items={atsResult.missing_requirements} />
                <ListBlock title="Weak evidence" items={atsResult.weak_evidence} />
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
          <div role="tabpanel" id="ai-panel-tailor" aria-labelledby="ai-tab-tailor" tabIndex={0} className="ai-body">
            <JobDescriptionField value={jobDescription} onChange={setJobDescription} />
            <button
              className="ai-primary"
              disabled={tailor.blocked || !jobDescription.trim()}
              onClick={() => {
                setNotice(null);
                setDecisions({});
                void tailor.run(() => aiApi.tailorResume(resume, jobDescription), jobKey);
              }}
            >
              Suggest tailoring changes
            </button>
            <p className="ai-hint">Every suggestion must quote the resume text it replaces and the requirement it answers.</p>
            {tailor.state.status === 'loading' && <Loading label="Preparing tailoring suggestions…" />}
            {tailor.state.error && <ErrorNotice error={tailor.state.error} />}
            {tailor.state.retryAfter > 0 && <RateLimited seconds={tailor.state.retryAfter} />}
            {tailorStale && tailoringResult && <Alert tone="warning">These suggestions are outdated because the resume or job description changed. Prepare them again.</Alert>}
            {tailoringResult && !tailorStale && tailor.state.status === 'success' && tailoringResult.suggestions.length === 0 && (
              <p className="ai-empty" role="status">No truthful changes were identified for this posting.</p>
            )}
            {tailoringResult && !tailorStale && tailoringResult.suggestions.length > 0 && (
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
                        <button className="ai-primary" disabled={tailorStale} aria-label={`Accept suggestion ${index + 1}`} onClick={() => void acceptTailoringSuggestion(suggestion)}>Accept</button>
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
    </Dialog>
  );
}

