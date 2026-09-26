from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SectionId = Literal['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom']


class RichTextNode(BaseModel):
    type: str
    text: str | None = None
    attrs: dict[str, str | int | bool | None] | None = None
    marks: list[dict[str, Any]] | None = None
    content: list['RichTextNode'] | None = None


class RichText(BaseModel):
    type: Literal['doc'] = 'doc'
    content: list[RichTextNode] = Field(default_factory=list)


class PersonalDetails(BaseModel):
    name: str = ''
    title: str = ''
    email: str = ''
    phone: str = ''
    location: str = ''
    linkedin: str = ''
    github: str = ''
    website: str = ''


class Entry(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    start: str | None = None
    end: str | None = None
    current: bool | None = False
    description: str | RichText | None = None
    bullets: list[str] | None = None
    url: str | None = None
    degree: str | None = None
    institution: str | None = None
    grade: str | None = None
    name: str | None = None
    role: str | None = None
    technologies: str | None = None
    github: str | None = None
    live: str | None = None
    category: str | None = None
    items: list[str] | str | None = None
    issuer: str | None = None
    date: str | None = None
    credentialId: str | None = None
    label: str | None = None
    content: str | None = None


class ResumeSettings(BaseModel):
    template: Literal['modern', 'ats', 'classic', 'executive', 'sidebar'] = 'modern'
    font: Literal['inter', 'georgia', 'arial', 'times'] = 'inter'
    nameSize: int = Field(default=34, ge=24, le=48)
    titleSize: int = Field(default=16, ge=12, le=22)
    headingSize: int = Field(default=14, ge=12, le=20)
    bodySize: int = Field(default=15, ge=15, le=20)
    lineHeight: float = Field(default=1.45, ge=1.1, le=1.8)
    letterSpacing: int = Field(default=0, ge=-1, le=2)
    margin: int = Field(default=18, ge=10, le=28)
    sectionGap: int = Field(default=15, ge=8, le=28)
    entryGap: int = Field(default=10, ge=6, le=24)
    accent: str = '#256b61'
    divider: str = '#dfe5e2'
    dividerStyle: Literal['none', 'thin', 'medium', 'styled'] = 'thin'
    text: str = '#263a36'
    skillsLayout: Literal['tags', 'inline', 'grouped', 'columns'] = 'tags'
    headerLayout: Literal['left', 'center'] = 'left'

    @field_validator('accent', 'divider', 'text')
    @classmethod
    def validate_color(cls, value: str) -> str:
        if re.fullmatch(r'#[0-9A-Fa-f]{6}', value):
            return value
        raise ValueError('Color must be a hex code like #256b61')


class Resume(BaseModel):
    id: str
    updatedAt: str
    personal: PersonalDetails
    profile: RichText
    experience: list[Entry] = Field(default_factory=list)
    education: list[Entry] = Field(default_factory=list)
    projects: list[Entry] = Field(default_factory=list)
    skills: list[Entry] = Field(default_factory=list)
    certifications: list[Entry] = Field(default_factory=list)
    achievements: list[Entry] = Field(default_factory=list)
    links: list[Entry] = Field(default_factory=list)
    custom: list[Entry] = Field(default_factory=list)
    sectionsOrder: list[SectionId] = Field(
        default_factory=lambda: ['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom']
    )
    hiddenSections: list[SectionId] = Field(default_factory=list)
    settings: ResumeSettings = Field(default_factory=ResumeSettings)


class ResumeCreate(BaseModel):
    resume: Resume


class ResumeUpdate(BaseModel):
    resume: Resume
