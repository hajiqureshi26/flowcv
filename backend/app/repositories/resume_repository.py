from __future__ import annotations

from copy import deepcopy

from app.repositories.base_repository import BaseRepository
from app.schemas.resume import Resume


class InMemoryResumeRepository(BaseRepository[Resume]):
    def __init__(self) -> None:
        self._store: dict[str, Resume] = {}

    def create(self, item: Resume) -> Resume:
        payload = deepcopy(item)
        self._store[payload.id] = payload
        return deepcopy(payload)

    def get_by_id(self, item_id: str) -> Resume | None:
        item = self._store.get(item_id)
        return deepcopy(item) if item is not None else None

    def update(self, item_id: str, item: Resume) -> Resume | None:
        if item_id not in self._store:
            return None
        self._store[item_id] = deepcopy(item)
        return deepcopy(self._store[item_id])

    def delete(self, item_id: str) -> bool:
        if item_id not in self._store:
            return False
        del self._store[item_id]
        return True


resume_repository = InMemoryResumeRepository()
