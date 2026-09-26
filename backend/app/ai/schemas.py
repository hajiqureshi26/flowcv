from __future__ import annotations

from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

from app.schemas.resume import Resume, SectionId


ResumeOperation = Literal['improve', 'grammar', 'clarity', 'conciseness', 'professional_wording']


class ResumeImproveRequest(BaseModel):
    resume: Resume
    section: SectionId
    content: str = Field(min_length=1)
    operation: ResumeOperation = 'improve'


class ResumeImproveResult(BaseModel):
    original: str
    suggested: str = Field(min_length=1)
    rationale: str = ''


class JDAnalysisRequest(BaseModel):
    job_description: str = Field(min_length=1)


class JDAnalysisResult(BaseModel):
    job_title: str = ''
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    experience_requirements: list[str] = Field(default_factory=list)
    education_requirements: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    ats_keywords: list[str] = Field(default_factory=list)


class ATSAnalysisRequest(BaseModel):
    resume: Resume
    job_description: str = Field(min_length=1)


class ATSAnalysisResult(BaseModel):
    matching_skills: list[str] = Field(default_factory=list)
    missing_relevant_keywords: list[str] = Field(default_factory=list)
    content_issues: list[str] = Field(default_factory=list)
    formatting_concerns: list[str] = Field(default_factory=list)
    experience_alignment: list[str] = Field(default_factory=list)
    education_alignment: list[str] = Field(default_factory=list)
    actionable_suggestions: list[str] = Field(default_factory=list)


class TailoringRequest(BaseModel):
    resume: Resume
    job_description: str = Field(min_length=1)


class TailoringSuggestion(BaseModel):
    id: str = Field(min_length=1)
    section: SectionId
    entry_id: str | None = None
    original_content: str
    suggested_content: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    supporting_requirement: str = Field(min_length=1)


class TailoringResult(BaseModel):
    suggestions: list[TailoringSuggestion] = Field(default_factory=list)


class ProviderMetadata(BaseModel):
    name: Literal['gemini', 'openrouter']
    model: str
    fallback_used: bool = False
    cached: bool = False


ResultT = TypeVar('ResultT', bound=BaseModel)


class AIResponse(BaseModel, Generic[ResultT]):
    result: ResultT
    provider: ProviderMetadata