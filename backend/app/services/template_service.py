from __future__ import annotations

from app.repositories.template_repository import template_repository
from app.schemas.template import TemplateDefinition


class TemplateService:
    def __init__(self, repository=None) -> None:
        self.repository = repository or template_repository

    def list_templates(self) -> list[TemplateDefinition]:
        return self.repository.list_all()

    def get_template(self, template_id: str) -> TemplateDefinition | None:
        return self.repository.get_by_id(template_id)


template_service = TemplateService()
