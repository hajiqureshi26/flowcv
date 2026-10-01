from __future__ import annotations

import logging
from threading import BoundedSemaphore
from time import monotonic
from html import escape
from typing import Any
from urllib.parse import urlsplit

from fastapi import HTTPException
from playwright.sync_api import sync_playwright
from pydantic import ValidationError

from app.config.settings import get_settings
from app.schemas.resume import Resume
from app.services.resume_service import resume_service
from app.services.template_service import template_service

logger = logging.getLogger(__name__)


class TemplateRenderer:
    styles = {
        'modern': '.resume-sections { column-count: 2; column-gap: 8mm; } .resume-section { break-inside: avoid-column; } .resume-header { border-left: 4px solid var(--accent); padding-left: 3mm; }',
        'ats': '.resume-header { border-bottom: 1px solid #222; } .resume-section h2 { border-bottom-color: #555; }',
        'classic': '.resume { font-family: Georgia, serif; } .resume-header { text-align: center; border-bottom: 3px double var(--divider); }',
        'executive': '.resume { font-size: 9.5pt; } .resume-section { margin-bottom: 3mm; } .resume-section h2 { margin: 2mm 0 1mm; } .resume-entry { margin-bottom: 1.5mm; }',
        'sidebar': '.resume-header { display: grid; grid-template-columns: minmax(0, 1fr) 34%; gap: 8mm; align-items: end; } .contact { border-left: 2px solid var(--accent); padding-left: 4mm; }',
    }

    @classmethod
    def style_for(cls, template_id: str) -> str:
        try:
            return cls.styles[template_id]
        except KeyError as exc:
            raise ValueError(f'Unsupported PDF template: {template_id}') from exc


template_renderer = TemplateRenderer()


class PDFService:
    def __init__(self) -> None:
        self._render_slots = BoundedSemaphore(get_settings().pdf_max_concurrent_renders)

    @staticmethod
    def _normalize_resume_payload(payload: Resume | dict[str, Any]) -> Resume:
        if isinstance(payload, Resume):
            return payload
        try:
            return Resume.model_validate(payload)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail='Invalid resume payload') from exc

    def get_resume_data(self, resume_id: str, payload: dict | None) -> Resume | None:
        if payload is not None:
            return self._normalize_resume_payload(payload)
        return resume_service.get_resume(resume_id)

    def render_resume_pdf(self, resume: Resume | dict[str, Any], template_id: str | None = None) -> bytes:
        normalized_resume = self._normalize_resume_payload(resume)
        selected_template = template_id or normalized_resume.settings.template
        if template_service.get_template(selected_template) is None:
            raise HTTPException(status_code=400, detail=f'Unsupported PDF template: {selected_template}')
        html = self._build_resume_html(normalized_resume, selected_template)
        settings = get_settings()
        if not self._render_slots.acquire(timeout=settings.pdf_render_queue_timeout_seconds):
            raise HTTPException(status_code=503, detail='PDF rendering is busy. Please retry shortly.', headers={'Retry-After': '2'})
        started = monotonic()
        success = False
        try:
            pdf_bytes = self._render_html_to_pdf(html, settings.pdf_render_timeout_ms)
            success = True
            return pdf_bytes
        finally:
            self._render_slots.release()
            logger.info('pdf_render_finished duration_ms=%d success=%s', round((monotonic() - started) * 1000), success)

    @property
    def max_concurrent_renders(self) -> int:
        return get_settings().pdf_max_concurrent_renders

    @staticmethod
    def _render_html_to_pdf(html: str, timeout_ms: int) -> bytes:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={'width': 1200, 'height': 1600}, device_scale_factor=1)
                page.set_content(html, wait_until='load', timeout=timeout_ms)
                return page.pdf(print_background=True, prefer_css_page_size=True)
            finally:
                browser.close()

    def _build_resume_html(self, resume: Resume, template: str) -> str:
        template_style = template_renderer.style_for(template)
        sections: list[str] = []
        for section_id in resume.sectionsOrder:
            if section_id in resume.hiddenSections:
                continue
            if section_id == 'profile':
                content = ''.join(self._render_rich_text(block) for block in resume.profile.content)
                if content.strip():
                    sections.append(f'<section class="resume-section"><h2>Profile</h2>{content}</section>')
                continue
            entries = getattr(resume, section_id)
            if not entries:
                continue
            labels = {
                'experience': 'Experience',
                'education': 'Education',
                'projects': 'Projects',
                'skills': 'Skills',
                'certifications': 'Certifications',
                'achievements': 'Achievements',
                'links': 'Links',
                'custom': 'Additional',
            }
            items: list[str] = []
            for entry in entries:
                if section_id == 'experience':
                    period_end = 'Present' if entry.current else (entry.end or '')
                    items.append(
                        f"<div><strong>{escape(entry.title or 'Role')}</strong>"
                        f"<p>{escape(entry.company or '')} | {escape(entry.location or '')}</p>"
                        f"<p>{escape(entry.start or '')} - {escape(period_end)}</p>"
                        f"{self._render_entry_details(entry)}</div>"
                    )
                elif section_id == 'skills':
                    skill_values = entry.items if isinstance(entry.items, list) else str(entry.items or '').split(',')
                    joined = escape(' · '.join(skill_values))
                    items.append(f"<div><strong>{escape(entry.category or 'Skills')}</strong><p>{joined}</p></div>")
                else:
                    heading = entry.name or entry.title or entry.label or 'Item'
                    detail = entry.company or entry.institution or entry.content or ''
                    items.append(
                        f"<div><strong>{escape(heading)}</strong><p>{escape(detail)}</p>"
                        f"{self._render_entry_details(entry)}</div>"
                    )
            sections.append(f'<section class="resume-section"><h2>{escape(labels.get(section_id, section_id.title()))}</h2>{"".join(items)}</section>')

        contact_items = []
        for value in (
            resume.personal.email,
            resume.personal.phone,
            resume.personal.location,
            resume.personal.linkedin,
            resume.personal.github,
            resume.personal.website,
        ):
            if not value:
                continue
            contact_url = f'mailto:{value}' if '@' in value else self._safe_url(value)
            if contact_url:
                contact_items.append(f'<a href="{escape(contact_url, quote=True)}">{escape(value)}</a>')
            else:
                contact_items.append(escape(value))
        contact = ' | '.join(contact_items)
        font_family = {
            'georgia': 'Georgia, serif',
            'arial': 'Arial, sans-serif',
            'times': '"Times New Roman", serif',
        }.get(resume.settings.font, 'Arial, sans-serif')
        return f"""
                <!doctype html>
                <html lang="en">
          <head>
                        <meta charset="utf-8">
            <style>
                            @page {{ size: A4; margin: 14mm; }}
                            * {{ box-sizing: border-box; }}
                            body {{ font-family: {font_family}; margin: 0; padding: 0; color: {resume.settings.text}; font-size: {resume.settings.bodySize}px; line-height: {resume.settings.lineHeight}; }}
                            .resume {{ --accent: {resume.settings.accent}; --divider: {resume.settings.divider}; overflow-wrap: anywhere; }}
                            .resume-header {{ display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6mm; align-items: end; margin-bottom: 5mm; padding-bottom: 3mm; }}
                            .identity {{ min-width: 0; }}
                            h1 {{ color: var(--accent); font-size: {resume.settings.nameSize}px; line-height: 1.12; margin: 0; overflow-wrap: anywhere; }}
                            .title {{ font-size: {resume.settings.titleSize}px; margin: 1.5mm 0 0; }}
                            h2 {{ font-size: {resume.settings.headingSize}px; margin: 0 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid var(--divider); break-after: avoid; }}
                            p {{ font-size: inherit; line-height: inherit; margin: 1mm 0; overflow-wrap: anywhere; }}
                            .contact {{ font-size: 9pt; max-width: 58mm; overflow-wrap: anywhere; }}
                            .resume-section {{ margin-bottom: 5mm; break-inside: auto; }}
                            .resume-entry {{ margin-bottom: 3mm; break-inside: auto; }}
                            .resume-entry strong {{ break-after: avoid; }}
                            .resume-meta {{ color: #4b5563; font-size: .92em; }}
                            ul {{ margin: 1mm 0 1mm 5mm; padding-left: 3mm; }}
                            li {{ margin-bottom: 1mm; overflow-wrap: anywhere; }}
                            a {{ color: inherit; overflow-wrap: anywhere; text-decoration: underline; }}
                            {template_style}
            </style>
          </head>
          <body>
                        <article class="resume resume-{escape(template, quote=True)}">
                            <header class="resume-header">
                                <div class="identity">
                                    <h1>{escape(resume.personal.name or 'Your name')}</h1>
                                    <p class="title">{escape(resume.personal.title or 'Professional title')}</p>
                                </div>
              <div class="contact">{contact}</div>
                            </header>
                            <main class="resume-sections">{''.join(sections)}</main>
                        </article>
          </body>
        </html>
        """

    @classmethod
    def _render_rich_text(cls, value: Any) -> str:
        if isinstance(value, str):
            return escape(value)
        if isinstance(value, list):
            return ''.join(cls._render_rich_text(item) for item in value)
        if hasattr(value, 'model_dump'):
            value = value.model_dump()
        if not isinstance(value, dict):
            return ''

        node_type = value.get('type')
        if node_type == 'text':
            rendered = escape(value.get('text') or '')
            for mark in value.get('marks') or []:
                if not isinstance(mark, dict):
                    continue
                mark_type = mark.get('type')
                if mark_type == 'link':
                    attrs = mark.get('attrs') or {}
                    href = cls._safe_url(attrs.get('href') if isinstance(attrs, dict) else None)
                    if href:
                        rendered = f'<a href="{escape(href, quote=True)}">{rendered}</a>'
                    continue
                tag = {'bold': 'strong', 'italic': 'em', 'underline': 'u', 'strike': 's', 'code': 'code'}.get(mark_type)
                if tag:
                    rendered = f'<{tag}>{rendered}</{tag}>'
            return rendered

        if node_type == 'hardBreak':
            return '<br>'
        children = cls._render_rich_text(value.get('content') or [])
        tag = {
            'paragraph': 'p',
            'heading': 'h3',
            'bulletList': 'ul',
            'orderedList': 'ol',
            'listItem': 'li',
            'blockquote': 'blockquote',
        }.get(node_type)
        return f'<{tag}>{children}</{tag}>' if tag else children

    @classmethod
    def _render_entry_details(cls, entry: Any) -> str:
        details: list[str] = []
        metadata = [
            entry.role,
            entry.technologies,
            entry.institution,
            entry.degree,
            entry.grade,
            entry.issuer,
            entry.date,
            entry.credentialId,
        ]
        metadata_text = ' · '.join(escape(value) for value in metadata if value)
        if metadata_text:
            details.append(f'<p class="resume-meta">{metadata_text}</p>')
        description = cls._render_rich_text(entry.description)
        if description.strip():
            details.append(description)
        if entry.bullets:
            bullets = ''.join(f'<li>{escape(bullet)}</li>' for bullet in entry.bullets)
            details.append(f'<ul>{bullets}</ul>')
        for label, value in (('Link', entry.url), ('GitHub', entry.github), ('Live', entry.live)):
            safe_url = cls._safe_url(value)
            if safe_url:
                details.append(f'<p><a href="{escape(safe_url, quote=True)}">{escape(label)}: {escape(value)}</a></p>')
        return ''.join(details)

    @staticmethod
    def _safe_url(value: str | None) -> str | None:
        if not value:
            return None
        url = value.strip()
        if not url:
            return None
        if '.' in url.split('/')[0] and '://' not in url and not url.startswith('mailto:'):
            url = f'https://{url}'
        parsed = urlsplit(url)
        if parsed.scheme not in {'http', 'https', 'mailto'}:
            return None
        if parsed.scheme in {'http', 'https'} and not parsed.netloc:
            return None
        return url


pdf_service = PDFService()
