from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
import re
from typing import Any

from docx import Document as DocxDocument
from pypdf import PdfReader

from app.schemas.resume import Resume


class ImportService:
    def normalize_resume(self, raw: dict[str, Any]) -> Resume:
        cleaned = dict(raw)
        cleaned.setdefault('id', 'imported-resume')
        cleaned.setdefault('updatedAt', datetime.now(UTC).isoformat().replace('+00:00', 'Z'))
        cleaned.setdefault('personal', {
            'name': '',
            'title': '',
            'email': '',
            'phone': '',
            'location': '',
            'linkedin': '',
            'github': '',
            'website': '',
        })
        cleaned.setdefault('profile', {'type': 'doc', 'content': []})
        cleaned.setdefault('experience', [])
        cleaned.setdefault('education', [])
        cleaned.setdefault('projects', [])
        cleaned.setdefault('skills', [])
        cleaned.setdefault('certifications', [])
        cleaned.setdefault('achievements', [])
        cleaned.setdefault('links', [])
        cleaned.setdefault('custom', [])
        cleaned.setdefault('sectionsOrder', ['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'])
        cleaned.setdefault('hiddenSections', [])
        cleaned.setdefault('settings', {
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
        })
        return Resume.model_validate(cleaned)

    def import_from_pdf(self, data: bytes) -> Resume:
        try:
            reader = PdfReader(BytesIO(data), strict=False)
            if reader.is_encrypted and not reader.decrypt(''):
                raise ValueError('Encrypted PDFs cannot be imported')
        except Exception as exc:  # pragma: no cover - defensive branch
            if isinstance(exc, ValueError):
                raise
            raise ValueError('Invalid PDF file') from exc

        if not reader.pages:
            raise ValueError('PDF file did not contain any pages')

        try:
            text_chunks: list[str] = []
            for page in reader.pages:
                page_text = page.extract_text() or ''
                text_chunks.append(page_text)
        except Exception as exc:
            raise ValueError('Could not extract readable text from the PDF') from exc

        extracted = '\n'.join(text_chunks).strip()
        if not extracted:
            raise ValueError('Could not extract any readable text from the PDF')

        profile_text = self._normalize_text(extracted[:2000])
        resume = {
            'id': 'imported-pdf-resume',
            'updatedAt': datetime.now(UTC).isoformat().replace('+00:00', 'Z'),
            'personal': {
                'name': self._extract_name(extracted),
                'title': '',
                'email': self._extract_email(extracted),
                'phone': self._extract_phone(extracted),
                'location': '',
                'linkedin': '',
                'github': '',
                'website': '',
            },
            'profile': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': profile_text}]}]},
            'experience': [],
            'education': [],
            'projects': [],
            'skills': [],
            'certifications': [],
            'achievements': [],
            'links': [],
            'custom': [{'id': 'imported-pdf-note', 'title': 'Imported PDF content', 'content': extracted}],
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
        return self.normalize_resume(resume)

    def import_from_docx(self, data: bytes) -> Resume:
        try:
            document = DocxDocument(BytesIO(data))
            content_parts = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    row_text = ' | '.join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        content_parts.append(row_text)
        except Exception as exc:  # pragma: no cover - defensive branch
            raise ValueError('Invalid DOCX file') from exc

        content = '\n'.join(content_parts)
        if not content:
            raise ValueError('Could not extract any content from the DOCX file')

        resume = {
            'id': 'imported-docx-resume',
            'updatedAt': datetime.now(UTC).isoformat().replace('+00:00', 'Z'),
            'personal': {
                'name': self._extract_name(content),
                'title': '',
                'email': self._extract_email(content),
                'phone': self._extract_phone(content),
                'location': '',
                'linkedin': '',
                'github': '',
                'website': '',
            },
            'profile': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': self._normalize_text(content[:2000])}]}]},
            'experience': [],
            'education': [],
            'projects': [],
            'skills': [],
            'certifications': [],
            'achievements': [],
            'links': [],
            'custom': [{'id': 'imported-docx-note', 'title': 'Imported DOCX content', 'content': content}],
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
        return self.normalize_resume(resume)

    @staticmethod
    def _normalize_text(value: str) -> str:
        return re.sub(r'\s+', ' ', value).strip()

    @staticmethod
    def _extract_email(value: str) -> str:
        match = re.search(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', value)
        return match.group(0) if match else ''

    @staticmethod
    def _extract_phone(value: str) -> str:
        matches = re.findall(r'\+?[0-9()\-\s]{7,}', value)
        for match in matches:
            cleaned = re.sub(r'\D', '', match)
            if len(cleaned) >= 7:
                return match.strip()
        return ''

    @staticmethod
    def _extract_name(value: str) -> str:
        lines = [line.strip() for line in value.splitlines() if line.strip()]
        for line in lines:
            if '@' not in line and len(line.split()) <= 7:
                return line
        return 'Imported Resume'


import_service = ImportService()
