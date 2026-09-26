from app.repositories.resume_repository import InMemoryResumeRepository
from app.schemas.resume import Resume
from app.services.resume_service import ResumeService


def sample_resume() -> Resume:
    return Resume.model_validate({
        'id': 'repository-test',
        'updatedAt': '2026-09-26T00:00:00Z',
        'personal': {'name': 'Original name'},
        'profile': {'type': 'doc', 'content': []},
    })


def test_repository_crud_and_copy_isolation() -> None:
    repository = InMemoryResumeRepository()
    service = ResumeService(repository)
    source = sample_resume()

    created = service.create_resume(source)
    source.personal.name = 'Mutated source'
    created.personal.name = 'Mutated result'
    assert service.get_resume(source.id).personal.name == 'Original name'

    fetched = service.get_resume(source.id)
    fetched.personal.name = 'Mutated read'
    assert service.get_resume(source.id).personal.name == 'Original name'

    updated = sample_resume()
    updated.personal.name = 'Updated name'
    assert service.update_resume(source.id, updated).personal.name == 'Updated name'
    assert service.update_resume('missing', updated) is None

    assert service.delete_resume(source.id) is True
    assert service.delete_resume(source.id) is False
    assert service.get_resume(source.id) is None