from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
import re
from typing import Any

from docx import Document as DocxDocument
from pypdf import PdfReader

from app.schemas.resume import Resume


class ImportService:
    SECTION_HEADINGS = {
        'profile': {'profile', 'summary', 'professional summary', 'objective', 'career objective', 'about me'},
        'experience': {'experience', 'work experience', 'professional experience', 'employment', 'employment history'},
        'education': {'education', 'academic background'},
        'projects': {'projects', 'selected projects', 'personal projects'},
        'skills': {'skills', 'technical skills', 'core skills', 'key skills', 'areas of expertise'},
        'certifications': {'certifications', 'licenses', 'licenses and certifications'},
        'achievements': {'achievements', 'awards', 'honors', 'honours'},
        'links': {'links', 'websites'},
    }

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

        return self._resume_from_extracted_text(extracted, 'imported-pdf-resume')

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

        return self._resume_from_extracted_text(content, 'imported-docx-resume')

    def _resume_from_extracted_text(self, extracted: str, resume_id: str) -> Resume:
        sections: dict[str, list[str]] = {key: [] for key in self.SECTION_HEADINGS}
        unclassified: list[str] = []
        heading_to_section = {heading: section for section, names in self.SECTION_HEADINGS.items() for heading in names}
        current: str | None = None
        for raw_line in extracted.splitlines():
            line = raw_line.strip()
            if not line:
                if current and sections[current] and sections[current][-1] != '':
                    sections[current].append('')
                elif current is None and unclassified and unclassified[-1] != '':
                    unclassified.append('')
                continue
            heading = re.sub(r'[:\s]+$', '', line).lower()
            heading = re.sub(r'^[•*#\-\s]+', '', heading)
            matched = heading_to_section.get(heading)
            if matched:
                current = matched
                continue
            if current:
                sections[current].append(line)
            else:
                unclassified.append(line)

        name = self._extract_name(extracted)
        email = self._extract_email(extracted)
        phone = self._extract_phone(extracted)
        contact_lines = {value.strip() for value in (name, email, phone) if value.strip()}
        unclassified = [line for line in unclassified if line.strip() not in contact_lines]

        def clean_lines(lines: list[str]) -> list[str]:
            return [line.strip() for line in lines if line.strip()]

        def blocks(lines: list[str]) -> list[str]:
            paragraphs: list[str] = []
            current_lines: list[str] = []
            for line in lines:
                if not line.strip():
                    if current_lines:
                        paragraphs.append('\n'.join(current_lines))
                        current_lines = []
                else:
                    current_lines.append(line.strip())
            if current_lines:
                paragraphs.append('\n'.join(current_lines))
            return paragraphs

        profile_paragraphs = blocks(sections['profile'])
        profile = {'type': 'doc', 'content': [
            {'type': 'paragraph', 'content': [{'type': 'text', 'text': paragraph}]}
            for paragraph in profile_paragraphs
        ]}

        def text_entries(key: str, field: str) -> list[dict[str, Any]]:
            return [{'id': f'imported-{key}-{index}', field: paragraph} for index, paragraph in enumerate(blocks(sections[key]))]

        skill_lines = clean_lines(sections['skills'])
        skill_values: list[str] = []
        for line in skill_lines:
            parts = re.split(r'\s*[•|;,]\s*', line)
            skill_values.extend(part.strip() for part in parts if part.strip())

        links: list[dict[str, str]] = []
        for index, line in enumerate(clean_lines(sections['links'])):
            url_match = re.search(r'(?:https?://)?(?:www\.)?[\w.-]+\.[A-Za-z]{2,}(?:/[^\s]*)?', line)
            if url_match:
                url = url_match.group(0)
                links.append({'id': f'imported-link-{index}', 'label': line, 'url': url})
            else:
                unclassified.append(line)

        resume = {
            'id': resume_id,
            'updatedAt': datetime.now(UTC).isoformat().replace('+00:00', 'Z'),
            'personal': {
                'name': name,
                'title': '',
                'email': email,
                'phone': phone,
                'location': '',
                'linkedin': '',
                'github': '',
                'website': '',
            },
            'profile': profile,
            'experience': text_entries('experience', 'description'),
            'education': text_entries('education', 'description'),
            'projects': text_entries('projects', 'description'),
            'skills': [{'id': 'imported-skills-0', 'category': 'Skills', 'items': skill_values}] if skill_values else [],
            'certifications': [{'id': f'imported-certification-{i}', 'name': line} for i, line in enumerate(clean_lines(sections['certifications']))],
            'achievements': [{'id': f'imported-achievement-{i}', 'title': line} for i, line in enumerate(clean_lines(sections['achievements']))],
            'links': links,
            'custom': [{'id': 'imported-unclassified-0', 'title': 'Unclassified extracted content', 'content': '\n'.join(unclassified).strip()}] if any(line.strip() for line in unclassified) else [],
            'sectionsOrder': ['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'],
            'hiddenSections': [],
            'settings': {},
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
        known_headings = {heading for headings in ImportService.SECTION_HEADINGS.values() for heading in headings}
        lines = [line.strip() for line in value.splitlines() if line.strip()]
        boilerplate = {'resume', 'curriculum vitae', 'cv', 'contact', 'portfolio', 'professional profile'}
        for line in lines[:6]:
            normalized = re.sub(r'[:\s]+$', '', line).lower()
            if normalized in known_headings:
                break
            words = line.split()
            if (
                2 <= len(words) <= 4
                and '@' not in line
                and not re.search(r'https?://|www\.|\d', line, re.I)
                and normalized not in boilerplate
                and all(word[:1].isupper() and (word[1:].islower() or not any(char.isalpha() for char in word[1:])) for word in words)
            ):
                return line
        return ''


import_service = ImportService()
