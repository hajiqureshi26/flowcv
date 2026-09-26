from __future__ import annotations

from app.repositories.base_repository import BaseRepository
from app.repositories.resume_repository import resume_repository
from app.schemas.resume import Resume


class ResumeService:
    def __init__(self, repository: BaseRepository[Resume] | None = None) -> None:
        self.repository = repository if repository is not None else resume_repository

    def create_resume(self, resume: Resume) -> Resume:
        return self.repository.create(resume)

    def get_resume(self, resume_id: str) -> Resume | None:
        return self.repository.get_by_id(resume_id)

    def update_resume(self, resume_id: str, resume: Resume) -> Resume | None:
        return self.repository.update(resume_id, resume)

    def delete_resume(self, resume_id: str) -> bool:
        return self.repository.delete(resume_id)


resume_service = ResumeService()
