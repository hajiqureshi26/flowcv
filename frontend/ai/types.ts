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
  keywords: string[];
  ats_keywords: string[];
};

export type ATSAnalysisResult = {
  matching_skills: string[];
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