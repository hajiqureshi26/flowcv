from __future__ import annotations

from pydantic import BaseModel


class TemplateDefinition(BaseModel):
    id: str
    name: str
    category: str
    layout: str
    componentClass: str
    capabilities: dict[str, object]
    recommended: dict[str, object]
