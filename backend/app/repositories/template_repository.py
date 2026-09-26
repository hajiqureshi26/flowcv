from __future__ import annotations

from app.repositories.base_repository import BaseRepository
from app.schemas.template import TemplateDefinition


class TemplateRepository(BaseRepository[TemplateDefinition]):
    def __init__(self) -> None:
        self._templates = [
            TemplateDefinition(
                id='modern',
                name='Modern two column',
                category='Modern',
                layout='two-column',
                componentClass='template-modern',
                capabilities={'columns': 2, 'atsFriendly': False, 'supportsSidebar': True},
                recommended={'bodySize': 15, 'headingSize': 14, 'accent': '#256b61'},
            ),
            TemplateDefinition(
                id='ats',
                name='Clean ATS',
                category='ATS',
                layout='one-column',
                componentClass='template-ats',
                capabilities={'columns': 1, 'atsFriendly': True, 'supportsSidebar': False},
                recommended={'bodySize': 15, 'headingSize': 14, 'accent': '#253a35'},
            ),
            TemplateDefinition(
                id='classic',
                name='Classic professional',
                category='Professional',
                layout='one-column',
                componentClass='template-classic',
                capabilities={'columns': 1, 'atsFriendly': True, 'supportsSidebar': False},
                recommended={'bodySize': 15, 'headingSize': 14, 'accent': '#49594f'},
            ),
            TemplateDefinition(
                id='executive',
                name='Compact executive',
                category='Professional',
                layout='compact',
                componentClass='template-executive',
                capabilities={'columns': 1, 'atsFriendly': True, 'supportsSidebar': False},
                recommended={'bodySize': 15, 'headingSize': 14, 'accent': '#256b61'},
            ),
            TemplateDefinition(
                id='sidebar',
                name='Modern sidebar',
                category='Modern',
                layout='sidebar',
                componentClass='template-sidebar',
                capabilities={'columns': 2, 'atsFriendly': False, 'supportsSidebar': True},
                recommended={'bodySize': 15, 'headingSize': 14, 'accent': '#256b61'},
            ),
        ]

    def list_all(self) -> list[TemplateDefinition]:
        return list(self._templates)

    def create(self, item: TemplateDefinition) -> TemplateDefinition:
        self._templates.append(item)
        return item

    def get_by_id(self, item_id: str) -> TemplateDefinition | None:
        for item in self._templates:
            if item.id == item_id:
                return item
        return None

    def update(self, item_id: str, item: TemplateDefinition) -> TemplateDefinition | None:
        for index, current in enumerate(self._templates):
            if current.id == item_id:
                self._templates[index] = item
                return item
        return None

    def delete(self, item_id: str) -> bool:
        for index, current in enumerate(self._templates):
            if current.id == item_id:
                del self._templates[index]
                return True
        return False


template_repository = TemplateRepository()
