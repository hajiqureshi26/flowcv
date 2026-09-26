from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.template import TemplateDefinition
from app.services.template_service import template_service

router = APIRouter(prefix='/templates', tags=['templates'])


@router.get('')
def list_templates() -> dict[str, object]:
    return {'templates': template_service.list_templates()}


@router.get('/{template_id}')
def get_template(template_id: str) -> TemplateDefinition:
    template = template_service.get_template(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail='Template not found')
    return template
