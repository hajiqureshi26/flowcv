import type { Resume, SectionKey } from '@/resume/types';

export type AIProviderMetadata = {
  name: 'gemini' | 'openrouter';
  model: string;
  fallback_used: boolean;
  cached: boolean;
};

export type AIResponse<Result> = {
  result: Result;
  provider: AIProviderMetadata;
};

export type ResumeImproveResult = {
  original: string;
  suggested: string;
  rationale: string;
};

export type JDAnalysisResult = {
  job_title: string;
  required_skills: string[];
  preferred_skills: string[];
  technologies: string[];
  responsibilities: string[];
  experience_requirements: string[];
  education_requirements: string[];
  certification_requirements: string[];
  keywords: string[];
  ats_keywords: string[];
  domain_signals: string[];
};

export type ATSAnalysisResult = {
  matched_requirements: string[];
  missing_requirements: string[];
  matching_skills: string[];
  weak_evidence: string[];
  missing_relevant_keywords: string[];
  content_issues: string[];
  formatting_concerns: string[];
  experience_alignment: string[];
  education_alignment: string[];
  actionable_suggestions: string[];
};

export type TailoringSuggestion = {
  id: string;
  section: SectionKey;
  entry_id: string | null;
  original_content: string;
  suggested_content: string;
  reason: string;
  supporting_requirement: string;
};

export type TailoringResult = { suggestions: TailoringSuggestion[] };

export type ResumeImproveInput = {
  resume: Resume;
  section: SectionKey;
  content: string;
  operation?: 'improve' | 'grammar' | 'clarity' | 'conciseness' | 'professional_wording';
};

export type ResumeHealthFinding = {
  id: string;
  category: 'content' | 'consistency' | 'readability' | 'relevance' | 'formatting' | 'structure';
  severity: 'critical' | 'warning' | 'suggestion' | 'good';
  location: string;
  title: string;
  explanation: string;
  recommendation: string;
};

export type ResumeHealthResult = { findings: ResumeHealthFinding[] };
