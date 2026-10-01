from __future__ import annotations

from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field, field_validator

from app.schemas.resume import Resume, SectionId


ResumeOperation = Literal['improve', 'grammar', 'clarity', 'conciseness', 'professional_wording']


class ResumeImproveRequest(BaseModel):
    resume: Resume
    section: SectionId
    content: str = Field(min_length=1, max_length=6000)
    operation: ResumeOperation = 'improve'


class ResumeHealthRequest(BaseModel):
    resume: Resume


class ResumeHealthFinding(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    category: Literal['content', 'consistency', 'readability', 'relevance', 'formatting', 'structure']
    severity: Literal['critical', 'warning', 'suggestion', 'good']
    location: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=1000)
    recommendation: str = Field(min_length=1, max_length=1000)


class ResumeHealthResult(BaseModel):
    findings: list[ResumeHealthFinding] = Field(default_factory=list, max_length=20)


class ResumeImproveResult(BaseModel):
    original: str = Field(max_length=6000)
    suggested: str = Field(min_length=1, max_length=6000)
    rationale: str = Field(default='', max_length=1000)


class JDAnalysisRequest(BaseModel):
    job_description: str = Field(min_length=1, max_length=20000)


class JDAnalysisResult(BaseModel):
    job_title: str = Field(default='', max_length=200)
    required_skills: list[str] = Field(default_factory=list, max_length=40)
    preferred_skills: list[str] = Field(default_factory=list, max_length=40)
    technologies: list[str] = Field(default_factory=list, max_length=40)
    responsibilities: list[str] = Field(default_factory=list, max_length=40)
    experience_requirements: list[str] = Field(default_factory=list, max_length=30)
    education_requirements: list[str] = Field(default_factory=list, max_length=30)
    certification_requirements: list[str] = Field(default_factory=list, max_length=30)
    keywords: list[str] = Field(default_factory=list, max_length=60)
    ats_keywords: list[str] = Field(default_factory=list, max_length=60)
    domain_signals: list[str] = Field(default_factory=list, max_length=40)

    @field_validator('required_skills', 'preferred_skills', 'technologies', 'responsibilities', 'experience_requirements', 'education_requirements', 'certification_requirements', 'keywords', 'ats_keywords', 'domain_signals')
    @classmethod
    def validate_items(cls, value: list[str]) -> list[str]:
        if any(not item.strip() or len(item) > 500 for item in value):
            raise ValueError('Items must contain 1 to 500 characters')
        return value


class ATSAnalysisRequest(BaseModel):
    resume: Resume
    job_description: str = Field(min_length=1, max_length=20000)


class ATSAnalysisResult(BaseModel):
    matched_requirements: list[str] = Field(default_factory=list, max_length=40)
    missing_requirements: list[str] = Field(default_factory=list, max_length=40)
    matching_skills: list[str] = Field(default_factory=list, max_length=40)
    weak_evidence: list[str] = Field(default_factory=list, max_length=40)
    missing_relevant_keywords: list[str] = Field(default_factory=list, max_length=40)
    content_issues: list[str] = Field(default_factory=list, max_length=40)
    formatting_concerns: list[str] = Field(default_factory=list, max_length=40)
    experience_alignment: list[str] = Field(default_factory=list, max_length=40)
    education_alignment: list[str] = Field(default_factory=list, max_length=40)
    actionable_suggestions: list[str] = Field(default_factory=list, max_length=40)

    @field_validator('matched_requirements', 'missing_requirements', 'matching_skills', 'weak_evidence', 'missing_relevant_keywords', 'content_issues', 'formatting_concerns', 'experience_alignment', 'education_alignment', 'actionable_suggestions')
    @classmethod
    def validate_items(cls, value: list[str]) -> list[str]:
        if any(not item.strip() or len(item) > 1000 for item in value):
            raise ValueError('Items must contain 1 to 1000 characters')
        return value


class TailoringRequest(BaseModel):
    resume: Resume
    job_description: str = Field(min_length=1, max_length=20000)


class TailoringSuggestion(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    section: SectionId
    entry_id: str | None = None
    original_content: str = Field(min_length=1, max_length=6000)
    suggested_content: str = Field(min_length=1, max_length=6000)
    reason: str = Field(min_length=1, max_length=1000)
    supporting_requirement: str = Field(min_length=1, max_length=500)


class TailoringResult(BaseModel):
    suggestions: list[TailoringSuggestion] = Field(default_factory=list, max_length=10)


class ProviderMetadata(BaseModel):
    name: Literal['gemini', 'openrouter']
    model: str
    fallback_used: bool = False
    cached: bool = False


ResultT = TypeVar('ResultT', bound=BaseModel)


class AIResponse(BaseModel, Generic[ResultT]):
    result: ResultT
    provider: ProviderMetadata
