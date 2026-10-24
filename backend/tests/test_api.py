from __future__ import annotations

import io

import pytest
from docx import Document as DocxDocument
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from app.config.settings import get_settings
from app.main import app

client = TestClient(app)


def make_resume(resume_id: str = 'resume-123') -> dict:
    return {
        'id': resume_id,
        'updatedAt': '2026-09-26T00:00:00Z',
        'personal': {
            'name': 'Jordan Lee',
            'title': 'Senior Product Engineer',
            'email': 'jordan@example.com',
            'phone': '+1 555 010 2026',
            'location': 'Seattle, WA',
            'linkedin': 'linkedin.com/in/jordanlee',
            'github': 'github.com/jordanlee',
            'website': 'jordanlee.dev',
        },
        'profile': {
            'type': 'doc',
            'content': [
                {
                    'type': 'paragraph',
                    'content': [
                        {'type': 'text', 'text': 'Engineer with experience across product delivery and platform reliability.'}
                    ],
                }
            ],
        },
        'experience': [
            {
                'id': 'exp-1',
                'title': 'Senior Product Engineer',
                'company': 'Northstar Labs',
                'location': 'Seattle, WA',
                'start': '2022',
                'end': 'Present',
                'current': True,
                'description': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Led architecture and delivery.'}]}]},
                'bullets': ['Improved platform reliability', 'Shipped new customer flows'],
                'url': 'https://northstar.example',
            }
        ],
        'education': [],
        'projects': [],
        'skills': [
            {'id': 'skill-1', 'category': 'Engineering', 'items': ['Python', 'TypeScript', 'AWS', 'SQL']}
        ],
        'certifications': [],
        'achievements': [],
        'links': [],
        'custom': [],
        'sectionsOrder': ['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'],
        'hiddenSections': [],
        'settings': {
            'template': 'modern',
            'font': 'inter',
            'nameSize': 34,
            'titleSize': 16,
            'headingSize': 14,
            'bodySize': 15,
            'lineHeight': 1.45,
            'letterSpacing': 0,
            'margin': 18,
            'sectionGap': 15,
            'entryGap': 10,
            'accent': '#256b61',
            'divider': '#dfe5e2',
            'dividerStyle': 'thin',
            'text': '#263a36',
            'skillsLayout': 'tags',
            'headerLayout': 'left',
        },
    }


def assert_no_null_values(value: object) -> None:
    if isinstance(value, dict):
        assert all(item is not None for item in value.values())
        for item in value.values():
            assert_no_null_values(item)
    elif isinstance(value, list):
        for item in value:
            assert_no_null_values(item)


def test_health_endpoint() -> None:
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_redis_health_endpoint_reports_available_and_unavailable_states(monkeypatch) -> None:
    class HealthyRedis:
        async def ping(self):
            return True

    class OfflineRedis:
        async def ping(self):
            raise ConnectionError('private redis host')

    monkeypatch.setattr('app.main.get_redis', lambda: HealthyRedis())
    healthy = client.get('/health/redis')
    assert healthy.status_code == 200 and healthy.json() == {'status': 'ok', 'redis': 'ok'}
    monkeypatch.setattr('app.main.get_redis', lambda: OfflineRedis())
    offline = client.get('/health/redis')
    assert offline.status_code == 503
    assert offline.json()['error']['message'] == 'Redis is unavailable'


def test_runtime_settings_accept_stage_two_environment_names() -> None:
    from app.config.settings import Settings

    settings = Settings(
        _env_file=None,
        APP_ENV='test',
        API_HOST='127.0.0.1',
        API_PORT=8010,
        CORS_ORIGINS=['https://flowcv.example'],
        IMPORT_MAX_FILE_SIZE_BYTES=2048,
        IMPORT_MAX_ARCHIVE_EXPANDED_BYTES=4096,
        PDF_RENDER_TIMEOUT_MS=9000,
        REDIS_URL='redis://localhost:6379/4',
        AI_REQUESTS_PER_MINUTE=3,
        AI_CACHE_TTL_SECONDS=45,
        AI_MAX_JD_CHARS=5000,
        GEMINI_MODEL='test-gemini-model',
        OPENROUTER_MODEL='test/openrouter-model',
        AI_IDENTITY_SECRET='test-secret',
        TRUSTED_PROXY_COUNT=1,
        TRUSTED_PROXY_HOSTS=['10.0.0.1'],
    )

    assert settings.app_env == 'test'
    assert settings.api_host == '127.0.0.1'
    assert settings.api_port == 8010
    assert settings.allowed_cors_origins == ['https://flowcv.example']
    assert settings.import_max_file_size_bytes == 2048
    assert settings.import_max_archive_expanded_bytes == 4096
    assert settings.pdf_render_timeout_ms == 9000
    assert settings.redis_url == 'redis://localhost:6379/4'
    assert settings.ai_requests_per_minute == 3
    assert settings.ai_cache_ttl_seconds == 45
    assert settings.ai_max_jd_chars == 5000
    assert settings.gemini_model == 'test-gemini-model'
    assert settings.openrouter_model == 'test/openrouter-model'
    assert settings.ai_identity_secret == 'test-secret'
    assert settings.trusted_proxy_count == 1
    assert settings.trusted_proxy_hosts == ['10.0.0.1']


def test_production_settings_reject_development_identity_secret() -> None:
    from app.config.settings import Settings

    with pytest.raises(ValueError, match='AI_IDENTITY_SECRET'):
        Settings(_env_file=None, APP_ENV='production', CORS_ORIGINS=['https://flowcv.example'])
    settings = Settings(
        _env_file=None,
        APP_ENV='production',
        CORS_ORIGINS=['https://flowcv.example'],
        AI_IDENTITY_SECRET='a' * 40,
    )
    assert settings.ai_identity_secret == 'a' * 40


def test_production_settings_require_explicit_cors_origins() -> None:
    from app.config.settings import Settings

    with pytest.raises(ValueError, match='CORS_ORIGINS'):
        Settings(_env_file=None, APP_ENV='production', AI_IDENTITY_SECRET='a' * 40)

    settings = Settings(
        _env_file=None,
        APP_ENV='production',
        CORS_ORIGINS=['https://flowcv.example'],
        AI_IDENTITY_SECRET='a' * 40,
    )
    assert settings.allowed_cors_origins == ['https://flowcv.example']


def test_structured_api_errors_hide_internal_details(monkeypatch: pytest.MonkeyPatch) -> None:
    missing = client.get('/api/resumes/not-found')
    assert missing.status_code == 404
    assert missing.json()['error']['code'] == 'not_found'

    invalid = client.post('/api/resumes', json={'resume': {'personal': {'name': 'private input'}}})
    assert invalid.status_code == 422
    assert invalid.json()['error']['code'] == 'validation_error'
    assert 'input' not in invalid.text

    from app.services.resume_service import resume_service

    def fail_get(_: str) -> None:
        raise RuntimeError('internal database credential')

    monkeypatch.setattr(resume_service, 'get_resume', fail_get)
    safe_client = TestClient(app, raise_server_exceptions=False)
    failed = safe_client.get('/api/resumes/unavailable')
    assert failed.status_code == 500
    assert failed.json() == {'error': {'code': 'internal_server_error', 'message': 'Internal server error'}}
    assert 'internal database credential' not in failed.text


def test_ai_request_body_size_limit_returns_structured_413() -> None:
    response = client.post('/api/ai/jd/analyze', content=b' ' * (get_settings().ai_max_request_bytes + 1))

    assert response.status_code == 413
    assert response.json()['error']['code'] == 'request_too_large'


def test_resume_crud_round_trip() -> None:
    payload = make_resume('resume-crud')

    create_response = client.post('/api/resumes', json={'resume': payload})
    assert create_response.status_code == 201
    created = create_response.json()
    assert created['id'] == payload['id']
    assert_no_null_values(created['profile'])

    get_response = client.get(f"/api/resumes/{payload['id']}")
    assert get_response.status_code == 200
    assert get_response.json()['personal']['name'] == 'Jordan Lee'
    assert_no_null_values(get_response.json()['profile'])

    update_payload = {**payload, 'personal': {**payload['personal'], 'name': 'Jordan M. Lee'}}
    put_response = client.put(f"/api/resumes/{payload['id']}", json={'resume': update_payload})
    assert put_response.status_code == 200
    assert put_response.json()['personal']['name'] == 'Jordan M. Lee'
    assert_no_null_values(put_response.json()['profile'])

    delete_response = client.delete(f"/api/resumes/{payload['id']}")
    assert delete_response.status_code == 204

    deleted_get = client.get(f"/api/resumes/{payload['id']}")
    assert deleted_get.status_code == 404


def test_missing_resume_and_missing_template() -> None:
    missing_resume = client.get('/api/resumes/does-not-exist')
    assert missing_resume.status_code == 404

    missing_template = client.get('/api/templates/does-not-exist')
    assert missing_template.status_code == 404


def test_template_endpoints() -> None:
    list_response = client.get('/api/templates')
    assert list_response.status_code == 200
    templates = list_response.json()['templates']
    assert any(item['id'] == 'modern' for item in templates)

    item_response = client.get('/api/templates/modern')
    assert item_response.status_code == 200
    assert item_response.json()['id'] == 'modern'


def test_invalid_resume_json_and_bad_import_payload() -> None:
    invalid_json = client.post('/api/imports/resume-json', json={'not': 'resume'})
    assert invalid_json.status_code == 422

    response = client.post('/api/imports/resume-json', json={'id': 'resume-no-personal', 'updatedAt': '2026', 'profile': {'type': 'doc', 'content': []}})
    assert response.status_code == 422


def test_import_normalizer_fills_missing_resume_sections() -> None:
    from app.services.import_service import import_service

    resume = import_service.normalize_resume({'id': 'partial-import', 'updatedAt': '2026-09-26T00:00:00Z'})

    assert resume.personal.name == ''
    assert resume.profile.content == []
    assert resume.experience == []
    assert resume.custom == []
    assert resume.settings.template == 'modern'


def test_pdf_generation_endpoint() -> None:
    resume_id = 'resume-pdf'
    create_response = client.post('/api/resumes', json={'resume': make_resume(resume_id)})
    assert create_response.status_code == 201

    pdf_response = client.post(f'/api/resumes/{resume_id}/pdf?templateId=ats')
    assert pdf_response.status_code == 200
    assert pdf_response.headers['content-type'].startswith('application/pdf')
    assert len(pdf_response.content) > 500

    reader = PdfReader(io.BytesIO(pdf_response.content))
    assert len(reader.pages) == 1
    assert round(float(reader.pages[0].mediabox.width)) == 595
    assert round(float(reader.pages[0].mediabox.height)) == 842
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    assert 'Jordan Lee' in text or 'Senior Product Engineer' in text
    assert 'Led architecture and delivery.' in text
    assert 'Improved platform reliability' in text
    annotations = reader.pages[0].get('/Annots') or []
    assert any('northstar.example' in str(annotation.get_object().get('/A', {}).get('/URI', '')) for annotation in annotations)

    bad_payload = client.post(
        f'/api/resumes/{resume_id}/pdf',
        json={'id': 'invalid', 'personal': {'name': '<private malformed payload>'}},
    )
    assert bad_payload.status_code == 422
    assert bad_payload.json()['error']['code'] == 'validation_error'
    assert 'private malformed payload' not in bad_payload.text

    unknown_template = client.post(f'/api/resumes/{resume_id}/pdf?templateId=unknown')
    assert unknown_template.status_code == 400
    assert unknown_template.json()['error']['code'] == 'bad_request'

    import_response = client.post(
        '/api/imports/pdf',
        files={'file': ('resume.pdf', pdf_response.content, 'application/pdf')},
    )
    assert import_response.status_code == 200
    imported_resume = import_response.json()
    assert_no_null_values(imported_resume['profile'])
    assert imported_resume['personal']['name'] == 'Jordan Lee'
    assert imported_resume['personal']['email'] == 'jordan@example.com'
    assert 'Improved platform reliability' in imported_resume['experience'][0]['description']


def test_docx_import_endpoint_normalizes_extracted_content() -> None:
    document = DocxDocument()
    document.add_paragraph('Avery Chen')
    document.add_paragraph('avery@example.com')
    document.add_paragraph('Product engineer with platform experience.')
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = 'Specialty'
    table.cell(0, 1).text = 'Accessibility & <design>'
    buffer = io.BytesIO()
    document.save(buffer)

    response = client.post(
        '/api/imports/docx',
        files={'file': ('resume.docx', buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )

    assert response.status_code == 200
    imported_resume = response.json()
    assert imported_resume['personal']['name'] == 'Avery Chen'
    assert imported_resume['personal']['email'] == 'avery@example.com'
    assert imported_resume['profile']['content'] == []
    assert 'Product engineer with platform experience.' in imported_resume['custom'][0]['content']
    assert 'Accessibility & <design>' in imported_resume['custom'][0]['content']


def test_import_structures_explicit_headings_and_preserves_unclassified_text() -> None:
    document = DocxDocument()
    document.add_paragraph('Mira Patel')
    document.add_paragraph('mira@example.com')
    document.add_paragraph('An original note that has no section heading.')
    document.add_paragraph('Professional Summary')
    document.add_paragraph('Design leader focused on accessible products.')
    document.add_paragraph('Experience:')
    document.add_paragraph('Product lead at Crescent Studio, 2021–2024')
    document.add_paragraph('Led research and shipped a redesigned checkout.')
    document.add_paragraph('Skills')
    document.add_paragraph('Research | Prototyping | Accessibility')
    buffer = io.BytesIO()
    document.save(buffer)

    response = client.post(
        '/api/imports/docx',
        files={'file': ('mira.docx', buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )
    assert response.status_code == 200
    imported = response.json()
    assert imported['personal']['name'] == 'Mira Patel'
    assert 'Design leader focused on accessible products.' in imported['profile']['content'][0]['content'][0]['text']
    assert 'title' not in imported['experience'][0]
    assert 'Product lead at Crescent Studio, 2021–2024' in imported['experience'][0]['description']
    assert imported['skills'][0]['items'] == ['Research', 'Prototyping', 'Accessibility']
    assert 'An original note that has no section heading.' in imported['custom'][0]['content']


def test_import_rejects_unsupported_malformed_empty_and_oversized_uploads(monkeypatch: pytest.MonkeyPatch) -> None:
    missing_file = client.post('/api/imports/docx')
    assert missing_file.status_code == 422
    assert missing_file.json()['error']['code'] == 'validation_error'

    unsupported = client.post('/api/imports/pdf', files={'file': ('resume.txt', b'text', 'text/plain')})
    assert unsupported.status_code == 415
    assert unsupported.json()['error']['code'] == 'unsupported_media_type'

    malformed_pdf = client.post('/api/imports/pdf', files={'file': ('resume.pdf', b'not a PDF', 'application/pdf')})
    assert malformed_pdf.status_code == 400

    broken_pdf = client.post('/api/imports/pdf', files={'file': ('broken.pdf', b'%PDF-1.7\nnot a document', 'application/pdf')})
    assert broken_pdf.status_code == 400
    assert broken_pdf.json()['error']['code'] == 'bad_request'

    malformed_docx = client.post('/api/imports/docx', files={'file': ('resume.docx', b'not a DOCX', 'application/octet-stream')})
    assert malformed_docx.status_code == 400

    broken_archive = io.BytesIO()
    import zipfile

    with zipfile.ZipFile(broken_archive, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('word/document.xml', '<invalid')
    broken_docx = client.post(
        '/api/imports/docx',
        files={'file': ('broken.docx', broken_archive.getvalue(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )
    assert broken_docx.status_code == 400

    empty_document = DocxDocument()
    empty_buffer = io.BytesIO()
    empty_document.save(empty_buffer)
    empty_docx = client.post(
        '/api/imports/docx',
        files={'file': ('empty.docx', empty_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )
    assert empty_docx.status_code == 400

    blank_pdf_buffer = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.write(blank_pdf_buffer)
    empty_pdf = client.post('/api/imports/pdf', files={'file': ('empty.pdf', blank_pdf_buffer.getvalue(), 'application/pdf')})
    assert empty_pdf.status_code == 400

    monkeypatch.setattr(get_settings(), 'import_max_file_size_bytes', 64)
    oversized = client.post('/api/imports/pdf', files={'file': ('large.pdf', b'%PDF-' + b'x' * 100, 'application/pdf')})
    assert oversized.status_code == 413
    assert oversized.json()['error']['code'] == 'file_too_large'

    archive_buffer = io.BytesIO()
    import zipfile

    with zipfile.ZipFile(archive_buffer, 'w') as archive:
        archive.writestr('[Content_Types].xml', 'x' * 100)
        archive.writestr('word/document.xml', 'x' * 100)
    monkeypatch.setattr(get_settings(), 'import_max_file_size_bytes', 1024)
    monkeypatch.setattr(get_settings(), 'import_max_archive_expanded_bytes', 128)
    oversized_docx = client.post(
        '/api/imports/docx',
        files={'file': ('expanded.docx', archive_buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
    )
    assert oversized_docx.status_code == 413


def test_pdf_html_escapes_user_content() -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    payload = make_resume('resume-html')
    payload['personal']['name'] = '<img src=x onerror=alert(1)>'
    payload['profile'] = {
        'type': 'doc',
        'content': [{
            'type': 'paragraph',
            'content': [{
                'type': 'text',
                'text': '<script>safe text</script>',
                'marks': [{'type': 'link', 'attrs': {'href': 'javascript:alert(1)'}}],
            }],
        }],
    }
    html = pdf_service._build_resume_html(Resume.model_validate(payload), 'modern')

    assert '<img src=' not in html
    assert '&lt;img src=x onerror=alert(1)&gt;' in html
    assert '<script>' not in html
    assert '&lt;script&gt;safe text&lt;/script&gt;' in html
    assert 'href="javascript:' not in html


@pytest.mark.parametrize('template_id', ['modern', 'ats', 'classic', 'executive', 'sidebar'])
def test_registered_templates_have_pdf_rendering_paths(template_id: str) -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    resume = Resume.model_validate(make_resume())
    html = pdf_service._build_resume_html(resume, template_id)
    reader = PdfReader(io.BytesIO(pdf_service.render_resume_pdf(resume, template_id=template_id)))

    assert f'resume-{template_id}' in html
    expected_root = '<main class="resume-columns">' if template_id in {'modern', 'sidebar'} else '<main class="resume-main">'
    assert expected_root in html
    assert len(reader.pages) == 1
    assert round(float(reader.pages[0].mediabox.width)) == 595
    assert round(float(reader.pages[0].mediabox.height)) == 842
    assert 'Jordan Lee' in (reader.pages[0].extract_text() or '')


def test_import_endpoint_accepts_resume_json() -> None:
    payload = make_resume('resume-import')
    import_response = client.post('/api/imports/resume-json', json=payload)
    assert import_response.status_code == 200
    body = import_response.json()
    assert body['id'] == 'resume-import'
    assert body['personal']['name'] == 'Jordan Lee'


def test_pdf_service_generates_expected_page_counts() -> None:
    from app.services.pdf_service import pdf_service

    base = make_resume('page-test-1')
    short_pdf = pdf_service.render_resume_pdf(base)
    short_reader = PdfReader(io.BytesIO(short_pdf))
    assert len(short_reader.pages) >= 1

    long_resume = {**base, 'experience': [], 'projects': []}
    long_sections = []
    for index in range(12):
        long_sections.append(
            {
                'id': f'proj-{index}',
                'name': f'Project {index}',
                'role': 'Engineer',
                'technologies': 'Python, AWS, React',
                'description': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'A long description ' * 30}]}]},
                'bullets': [f'Feature {i} delivered for scale and reliability.' for i in range(5)],
                'url': 'https://example.com/project',
            }
        )
    long_resume['projects'] = long_sections
    long_resume['sectionsOrder'] = ['profile', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom']
    long_pdf = pdf_service.render_resume_pdf(long_resume)
    long_reader = PdfReader(io.BytesIO(long_pdf))
    assert len(long_reader.pages) >= 3
    page_text = [page.extract_text() or '' for page in long_reader.pages]
    text = '\n'.join(page_text)
    assert all(content.strip() for content in page_text)
    assert 'Project 11' in text

    imported = client.post('/api/imports/pdf', files={'file': ('long.pdf', long_pdf, 'application/pdf')})
    assert imported.status_code == 200
    assert any('Project 11' in str(entry.get('name') or entry.get('description') or entry.get('title') or '') for entry in imported.json()['projects'])


def test_pdf_paginates_a_long_profile_using_configured_margin() -> None:
    from app.services.pdf_service import pdf_service

    payload = make_resume('two-page-profile')
    payload['profile'] = {
        'type': 'doc',
        'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'A measured profile sentence describing product work and reliable delivery. ' * 115}]}],
    }
    payload['experience'] = []
    payload['skills'] = []
    payload['sectionsOrder'] = ['profile']

    pdf_bytes = pdf_service.render_resume_pdf(payload, template_id='ats')
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)

    assert len(reader.pages) >= 2
    assert all((page.extract_text() or '').strip() for page in reader.pages)
    assert 'reliable delivery' in text
    assert all(round(float(page.mediabox.width)) == 595 for page in reader.pages)
    assert all(round(float(page.mediabox.height)) == 842 for page in reader.pages)


def test_pdf_renders_education_fields_and_uses_resume_margin() -> None:
    from app.services.pdf_service import pdf_service

    payload = make_resume('education-rendering')
    payload['settings']['margin'] = 22
    payload['education'] = [{
        'id': 'education-1',
        'degree': 'B.S. Computer Science',
        'institution': 'Synthetic University',
        'location': 'Seattle, WA',
        'start': '2018',
        'end': '2022',
        'grade': '3.9 GPA',
        'description': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Systems and accessible product design.'}]}]},
    }]
    payload['sectionsOrder'] = ['education']

    from app.schemas.resume import Resume
    html = pdf_service._build_resume_html(Resume.model_validate(payload), 'ats')
    reader = PdfReader(io.BytesIO(pdf_service.render_resume_pdf(payload, template_id='ats')))
    text = '\n'.join(page.extract_text() or '' for page in reader.pages)

    assert 'margin: 22mm' in html
    assert 'B.S. Computer Science' in text
    assert 'Synthetic University' in text
    assert 'Seattle, WA' in text
    assert '2018 - 2022' in text
    assert '3.9 GPA' in text
    assert 'Systems and accessible product design.' in text
    assert '\nItem\n' not in text


def test_pdf_two_column_templates_follow_editor_section_partition() -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    resume = Resume.model_validate(make_resume('column-layout'))
    for template in ('modern', 'sidebar'):
        html = pdf_service._build_resume_html(resume, template)
        sidebar_start = html.index('<aside class="resume-sidebar">')
        main_start = html.index('<div class="resume-main">')
        assert sidebar_start < main_start
        assert 'Skills' in html[sidebar_start:main_start]
        assert 'Experience' in html[main_start:]
        assert 'column-count: 2' not in html

    ats_html = pdf_service._build_resume_html(resume, 'ats')
    assert '<main class="resume-columns">' not in ats_html


@pytest.mark.parametrize(('layout', 'expected'), [
    ('tags', 'class="skill-tags"'),
    ('inline', 'Python · TypeScript · AWS · SQL'),
    ('grouped', 'Python, TypeScript, AWS, SQL'),
    ('columns', 'class="skill-columns"'),
])
def test_pdf_respects_selected_skills_layout(layout: str, expected: str) -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    payload = make_resume('skills-layout')
    payload['settings']['skillsLayout'] = layout
    html = pdf_service._build_resume_html(Resume.model_validate(payload), 'ats')

    assert expected in html


def test_pdf_honors_editor_typography_spacing_header_and_divider_settings() -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    payload = make_resume('rendering-settings')
    payload['settings'].update({
        'margin': 20,
        'bodySize': 17,
        'lineHeight': 1.6,
        'letterSpacing': 1,
        'sectionGap': 18,
        'entryGap': 12,
        'headerLayout': 'center',
        'dividerStyle': 'styled',
    })
    html = pdf_service._build_resume_html(Resume.model_validate(payload), 'executive')

    assert '@page { size: A4; margin: 20mm; }' in html
    assert 'font-size: 17px; line-height: 1.6; letter-spacing: 1px' in html
    assert 'margin-bottom: 12.96px' in html
    assert 'margin-bottom: 8.4px' in html
    assert '.header-center' in html
    assert '.divider-styled .resume-section h2' in html
    assert 'resume-executive' in html


def test_pdf_experience_uses_editor_heading_and_metadata_grouping() -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    payload = make_resume('experience-grouping')
    payload['experience'] = [{
        'id': 'experience-1',
        'title': 'Staff Engineer',
        'company': 'Example Labs',
        'location': 'Remote',
        'start': '2020',
        'current': True,
        'description': 'Built dependable systems.',
        'bullets': ['Reduced service latency by 40%.'],
    }]
    payload['sectionsOrder'] = ['experience']
    html = pdf_service._build_resume_html(Resume.model_validate(payload), 'ats')
    text = '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(pdf_service.render_resume_pdf(payload, 'ats'))).pages)

    assert '<div class="entry-head"><strong>Staff Engineer</strong><span>2020 - Present</span></div>' in html
    assert '<div class="entry-sub"><b>Example Labs</b> | Remote</div>' in html
    assert 'Built dependable systems.' in text
    assert 'Reduced service latency by 40%.' in text


def test_pdf_preserves_dense_content_order_visibility_and_links() -> None:
    from app.services.pdf_service import pdf_service

    payload = make_resume('dense-resume')
    payload['personal']['name'] = "Zoë & O'Neil — " + ('LongName' * 18)
    payload['profile'] = {
        'type': 'doc',
        'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Long profile context. ' * 100}]}],
    }
    payload['experience'] = [
        {
            'id': f'exp-{index}',
            'title': f'Experience role {index}',
            'company': 'Example & Sons',
            'description': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Long experience detail. ' * 70}]}]},
            'bullets': [f'Experience achievement {index}-{bullet} with impact.' for bullet in range(3)],
            'url': 'https://example.com/' + ('long-path-segment-' * 12),
        }
        for index in range(6)
    ]
    payload['projects'] = [
        {
            'id': f'project-{index}',
            'name': f'Long project {index}',
            'description': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Project delivery detail. ' * 45}]}]},
            'bullets': [f'Project feature {index}-{bullet} shipped.' for bullet in range(2)],
        }
        for index in range(15)
    ]
    payload['skills'] = [{'id': 'skills-many', 'category': 'Tools', 'items': [f'Skill {index}' for index in range(90)]}]
    payload['certifications'] = [
        {'id': f'cert-{index}', 'name': f'Certification {index}', 'issuer': 'Issuer', 'date': '2026'}
        for index in range(14)
    ]
    payload['achievements'] = [
        {'id': f'achievement-{index}', 'title': f'Achievement {index}', 'description': f'Award detail {index}'}
        for index in range(8)
    ]
    payload['custom'] = [{'id': 'custom-note', 'title': 'Custom section', 'content': 'Custom detail with <special> characters.'}]
    payload['education'] = [{'id': 'hidden-education', 'institution': 'Hidden School Must Not Appear'}]
    payload['links'] = [{'id': 'portfolio', 'label': 'Portfolio', 'url': 'https://example.com/' + ('long-url-segment-' * 18)}]
    payload['sectionsOrder'] = ['custom', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'links', 'profile', 'education']
    payload['hiddenSections'] = ['education']

    pdf_bytes = pdf_service.render_resume_pdf(payload, template_id='classic')
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = list(reader.pages)
    text = '\n'.join(page.extract_text() or '' for page in pages)
    annotations = [annotation.get_object() for page in pages for annotation in (page.get('/Annots') or [])]
    extracted_links = [str(annotation.get('/A', {}).get('/URI', '')) for annotation in annotations]

    assert len(pages) >= 3
    assert 'Custom section' in text and 'Custom detail' in text
    assert 'Experience role 5' in text and 'Project feature 14-1' in text
    assert 'Skill 89' in text and 'Certification 13' in text and 'Achievement 7' in text
    assert 'Zoë & O\'Neil' in text
    assert 'Hidden School Must Not Appear' not in text
    assert text.index('Custom section') < text.index('Experience') < text.index('Long project 0')
    assert any('long-url-segment' in url for url in extracted_links)
    assert all(round(float(page.mediabox.width)) == 595 for page in pages)
    assert all(round(float(page.mediabox.height)) == 842 for page in pages)


def test_pdf_uses_safe_defaults_for_empty_optional_sections_and_unsafe_links() -> None:
    from app.schemas.resume import Resume
    from app.services.pdf_service import pdf_service

    payload = make_resume('minimal-resume')
    payload['personal'] = {'name': '', 'title': '', 'email': '', 'phone': '', 'location': '', 'linkedin': 'javascript:alert(1)', 'github': '', 'website': ''}
    payload['profile'] = {'type': 'doc', 'content': []}
    payload['experience'] = []
    payload['education'] = []
    payload['projects'] = []
    payload['skills'] = []
    payload['certifications'] = []
    payload['achievements'] = []
    payload['links'] = [{'id': 'unsafe', 'label': 'Bad link', 'url': 'javascript:alert(1)'}]
    payload['custom'] = []

    html = pdf_service._build_resume_html(Resume.model_validate(payload), 'ats')
    pdf_bytes = pdf_service.render_resume_pdf(payload, template_id='ats')
    reader = PdfReader(io.BytesIO(pdf_bytes))

    assert 'Your name' in html
    assert 'href="javascript:' not in html
    assert len(reader.pages) == 1
