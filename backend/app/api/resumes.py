from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.resume import Resume, ResumeCreate, ResumeUpdate
from app.services.resume_service import resume_service

router = APIRouter(prefix='/resumes', tags=['resumes'])


@router.post('', status_code=201)
def create_resume(payload: ResumeCreate) -> Resume:
    return resume_service.create_resume(payload.resume)


@router.get('/{resume_id}')
def get_resume(resume_id: str) -> Resume:
    resume = resume_service.get_resume(resume_id)
    if resume is None:
        raise HTTPException(status_code=404, detail='Resume not found')
    return resume


@router.put('/{resume_id}')
def update_resume(resume_id: str, payload: ResumeUpdate) -> Resume:
    resume = resume_service.update_resume(resume_id, payload.resume)
    if resume is None:
        raise HTTPException(status_code=404, detail='Resume not found')
    return resume


@router.delete('/{resume_id}', status_code=204)
def delete_resume(resume_id: str) -> None:
    deleted = resume_service.delete_resume(resume_id)
    if not deleted:
        raise HTTPException(status_code=404, detail='Resume not found')
    return None
