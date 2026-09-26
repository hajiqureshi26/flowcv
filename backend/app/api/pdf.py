from __future__ import annotations

import re

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response

from app.services.pdf_service import pdf_service

router = APIRouter(prefix='/resumes', tags=['pdf'])


@router.post('/{resume_id}/pdf')
def generate_pdf(
    resume_id: str,
    payload: dict | None = Body(default=None),
    template_id: str | None = Query(default=None, alias='templateId'),
) -> Response:
    resume = pdf_service.get_resume_data(resume_id, payload)
    if resume is None:
        raise HTTPException(status_code=404, detail='Resume not found')
    pdf_bytes = pdf_service.render_resume_pdf(resume, template_id=template_id)
    safe_resume_id = re.sub(r'[^A-Za-z0-9_-]+', '_', resume_id)[:80] or 'resume'
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'Content-Disposition': f'attachment; filename="{safe_resume_id}.pdf"'},
    )
