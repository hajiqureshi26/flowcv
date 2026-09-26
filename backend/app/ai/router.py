from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.ai.orchestrator import AIOrchestrator
from app.ai.schemas import (
    AIResponse,
    ATSAnalysisRequest,
    ATSAnalysisResult,
    JDAnalysisRequest,
    JDAnalysisResult,
    ResumeImproveRequest,
    ResumeImproveResult,
    TailoringRequest,
    TailoringResult,
)
from app.ai.security import actor_fingerprint
from app.config.settings import get_settings
from app.redis.client import get_redis

router = APIRouter(prefix='/ai', tags=['ai'])


def get_ai_orchestrator() -> AIOrchestrator:
    return AIOrchestrator(get_redis(), get_settings())


@router.post('/resume/improve', response_model=AIResponse[ResumeImproveResult])
async def improve_resume(
    payload: ResumeImproveRequest,
    request: Request,
    orchestrator: AIOrchestrator = Depends(get_ai_orchestrator),
) -> AIResponse[ResumeImproveResult]:
    actor = actor_fingerprint(request, get_settings())
    return await orchestrator.improve_resume(payload, actor)


@router.post('/jd/analyze', response_model=AIResponse[JDAnalysisResult])
async def analyze_jd(
    payload: JDAnalysisRequest,
    request: Request,
    orchestrator: AIOrchestrator = Depends(get_ai_orchestrator),
) -> AIResponse[JDAnalysisResult]:
    actor = actor_fingerprint(request, get_settings())
    return await orchestrator.analyze_jd(payload, actor)


@router.post('/ats/analyze', response_model=AIResponse[ATSAnalysisResult])
async def analyze_ats(
    payload: ATSAnalysisRequest,
    request: Request,
    orchestrator: AIOrchestrator = Depends(get_ai_orchestrator),
) -> AIResponse[ATSAnalysisResult]:
    actor = actor_fingerprint(request, get_settings())
    return await orchestrator.analyze_ats(payload, actor)


@router.post('/tailor', response_model=AIResponse[TailoringResult])
async def tailor_resume(
    payload: TailoringRequest,
    request: Request,
    orchestrator: AIOrchestrator = Depends(get_ai_orchestrator),
) -> AIResponse[TailoringResult]:
    actor = actor_fingerprint(request, get_settings())
    return await orchestrator.tailor_resume(payload, actor)