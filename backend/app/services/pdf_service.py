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
        'modern': '.resume-columns { grid-template-columns: 31% minmax(0, 1fr); }',
        'ats': '.resume-header { border-bottom: 2px solid #202d29; } h1, h2 { color: #20312c; }',
        'classic': '.resume { font-family: Georgia, serif; } .resume-section h2 { border-bottom-color: #56625c; }',
        'executive': '',
        'sidebar': '.resume-columns { grid-template-columns: 34% minmax(0, 1fr); }',
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
        sidebar_sections: list[str] = []
        sidebar_ids = {'skills', 'education', 'certifications', 'links'}
        is_two_column = template in {'modern', 'sidebar'}
        for section_id in resume.sectionsOrder:
            if section_id in resume.hiddenSections:
                continue
            section_target = sidebar_sections if is_two_column and section_id in sidebar_ids else sections
            if section_id == 'profile':
                content = ''.join(self._render_rich_text(block) for block in resume.profile.content)
                if content.strip():
                    section_target.append(f'<section class="resume-section"><h2>Profile</h2>{content}</section>')
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
                        '<div class="resume-entry">'
                        f'<div class="entry-head"><strong>{escape(entry.title or "Role")}</strong><span>{escape(entry.start or "")}{" - " if entry.start and period_end else ""}{escape(period_end)}</span></div>'
                        f'<div class="entry-sub"><b>{escape(entry.company or "")}</b>{f" | {escape(entry.location)}" if entry.location else ""}</div>'
                        f"{self._render_entry_details(entry)}</div>"
                    )
                elif section_id == 'education':
                    period = ' - '.join(value for value in (entry.start, entry.end) if value)
                    institution = ' | '.join(value for value in (entry.institution, entry.location) if value)
                    details = self._render_rich_text(entry.description)
                    items.append(
                        '<div class="resume-entry">'
                        f"<div class=\"entry-head\"><strong>{escape(entry.degree or 'Education')}</strong>"
                        f"<span>{escape(period)}</span></div>"
                        f"<p class=\"resume-meta\">{escape(institution)}</p>"
                        f"{f'<p class=\"resume-meta\">{escape(entry.grade)}</p>' if entry.grade else ''}"
                        f"{details}</div>"
                    )
                elif section_id == 'skills':
                    skill_values = entry.items if isinstance(entry.items, list) else str(entry.items or '').split(',')
                    skill_values = [value.strip() for value in skill_values if value.strip()]
                    if resume.settings.skillsLayout == 'tags':
                        skill_content = '<div class="skill-tags">' + ''.join(f'<span>{escape(value)}</span>' for value in skill_values) + '</div>'
                    elif resume.settings.skillsLayout == 'columns':
                        skill_content = '<ul class="skill-columns">' + ''.join(f'<li>{escape(value)}</li>' for value in skill_values) + '</ul>'
                    else:
                        separator = ' · ' if resume.settings.skillsLayout == 'inline' else ', '
                        skill_content = f'<p class="skill-list">{escape(separator.join(skill_values))}</p>'
                    items.append(f"<div><strong>{escape(entry.category or 'Skills')}</strong>{skill_content}</div>")
                else:
                    heading = entry.name or entry.title or entry.label or 'Item'
                    detail = entry.company or entry.institution or entry.content or ''
                    items.append(
                        f"<div><strong>{escape(heading)}</strong><p>{escape(detail)}</p>"
                        f"{self._render_entry_details(entry)}</div>"
                    )
            section_target.append(f'<section class="resume-section"><h2>{escape(labels.get(section_id, section_id.title()))}</h2>{"".join(items)}</section>')

        if is_two_column:
            sections_markup = (
                '<main class="resume-columns">'
                f'<aside class="resume-sidebar">{"".join(sidebar_sections)}</aside>'
                f'<div class="resume-main">{"".join(sections)}</div>'
                '</main>'
            )
        else:
            sections_markup = f'<main class="resume-main">{"".join(sections)}</main>'

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
                            @page {{ size: A4; margin: {resume.settings.margin}mm; }}
                            * {{ box-sizing: border-box; }}
                            body {{ font-family: {font_family}; margin: 0; padding: 0; color: {resume.settings.text}; font-size: {resume.settings.bodySize}px; line-height: {resume.settings.lineHeight}; letter-spacing: {resume.settings.letterSpacing}px; }}
                            .resume {{ --accent: {resume.settings.accent}; --divider: {resume.settings.divider}; overflow-wrap: anywhere; }}
                            .resume-header {{ display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6mm; align-items: end; margin-bottom: {resume.settings.sectionGap}px; padding-bottom: 3mm; }}
                            .identity {{ min-width: 0; }}
                            h1 {{ color: var(--accent); font-size: {resume.settings.nameSize}px; font-weight: 800; letter-spacing: -1.2px; line-height: 1.12; margin: 0 0 3px; overflow-wrap: anywhere; }}
                            .title {{ font-size: {resume.settings.titleSize}px; color: #53645f; margin: 0 0 9px; }}
                            h2 {{ color: var(--accent); font-size: {resume.settings.headingSize}px; font-weight: 700; text-transform: uppercase; letter-spacing: .85px; margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--divider); break-after: avoid; }}
                            p {{ font-size: inherit; line-height: inherit; margin: 1mm 0; overflow-wrap: anywhere; }}
                            .contact {{ display: flex; flex-wrap: wrap; gap: 4px 12px; color: #63736d; font-size: .82em; max-width: 58mm; overflow-wrap: anywhere; }}
                            .resume-section {{ margin-bottom: {resume.settings.sectionGap}px; break-inside: auto; }}
                            .resume-columns {{ display: grid; grid-template-columns: 31% minmax(0, 1fr); gap: 22px; align-items: start; }}
                            .resume-sidebar {{ min-width: 0; border-right: 1px solid var(--divider); padding-right: 16px; }}
                            .resume-main {{ min-width: 0; }}
                            .resume-entry {{ margin-bottom: {resume.settings.entryGap if template != 'executive' else round(resume.settings.entryGap * .7, 2)}px; break-inside: auto; }}
                            .resume-section h2 {{ border-bottom-style: {('none' if resume.settings.dividerStyle == 'none' else 'double' if resume.settings.dividerStyle == 'styled' else 'solid')}; border-bottom-width: {2 if resume.settings.dividerStyle == 'medium' else 1}px; }}
                            .divider-none .resume-header, .divider-none .resume-section h2 {{ border-color: transparent; }}
                            .divider-medium .resume-header {{ border-bottom-width: 2px; }}
                            .header-center {{ text-align: center; }}
                            .header-center .contact {{ margin-left: auto; margin-right: auto; }}
                            .template-executive .resume-section {{ margin-bottom: {round(resume.settings.sectionGap * .72, 2)}px; }}
                            .template-executive .resume-header {{ padding-bottom: 8px; }}
                            .header-center .contact {{ margin-left: auto; margin-right: auto; }}
                            .divider-styled .resume-header {{ border-bottom: 0; border-top: 3px solid var(--accent); padding-top: 9px; }}
                            .divider-styled .resume-section h2 {{ border-bottom: 0; border-left: 3px solid var(--accent); padding: 2px 0 2px 8px; }}
                            .entry-head {{ display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }}
                            .entry-sub {{ margin-top: 2px; color: #66766f; }}
                            .resume-entry strong {{ break-after: avoid; }}
                            .resume-meta {{ color: #4b5563; font-size: .92em; }}
                            .skill-tags {{ display: flex; flex-wrap: wrap; gap: 1mm; margin-top: 1.2mm; }}
                            .skill-tags span {{ background: #eef4f1; padding: .8mm 1.5mm; border-radius: 1mm; font-size: .85em; overflow-wrap: anywhere; }}
                            .skill-list {{ overflow-wrap: anywhere; }}
                            .skill-columns {{ columns: 2; column-gap: 4mm; padding-left: 4mm; margin: 1.2mm 0; }}
                            .skill-columns li {{ break-inside: avoid; overflow-wrap: anywhere; margin-bottom: .8mm; }}
                            ul {{ margin: 1mm 0 1mm 5mm; padding-left: 3mm; }}
                            li {{ margin-bottom: 1mm; overflow-wrap: anywhere; }}
                            a {{ color: inherit; overflow-wrap: anywhere; text-decoration: underline; }}
                            {template_style}
            </style>
          </head>
          <body>
                            <article class="resume resume-{escape(template, quote=True)} divider-{resume.settings.dividerStyle}">
                            <header class="resume-header header-{resume.settings.headerLayout}">
                                <div class="identity">
                                    <h1>{escape(resume.personal.name or 'Your name')}</h1>
                                    <p class="title">{escape(resume.personal.title or 'Professional title')}</p>
                                </div>
              <div class="contact">{contact}</div>
                            </header>
                            {sections_markup}
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
