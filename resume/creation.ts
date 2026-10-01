import { defaultResume } from './defaults';
import type { Resume } from './types';

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `resume-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createResume(template = 'modern', blank = false): Resume {
  const resume = structuredClone(defaultResume);
  const id = newId();
  resume.id = id;
  resume.updatedAt = new Date().toISOString();
  resume.settings.template = template;
  if (blank) {
    resume.personal = { name: '', title: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '' };
    resume.profile = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    for (const key of ['experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'] as const) resume[key] = [];
  }
  return resume;
}
