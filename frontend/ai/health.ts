import type { Resume } from '@/resume/types';
import { flattenResumeText, sectionPlainText } from './text';

export type HealthSeverity = 'critical' | 'warning' | 'suggestion' | 'good';
export type HealthFinding = {
  id: string;
  category: 'contact' | 'content' | 'structure' | 'consistency' | 'formatting' | 'readability' | 'relevance';
  severity: HealthSeverity;
  location: string;
  title: string;
  explanation: string;
  recommendation: string;
  relatedField?: string;
};

const urlIsValid = (value: string) => {
  if (!value.trim()) return true;
  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalized);
    return Boolean(url.hostname.includes('.') && !/\s/.test(value));
  } catch {
    return false;
  }
};

export function analyzeResumeHealth(resume: Resume): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const add = (finding: Omit<HealthFinding, 'id'>) => findings.push({ ...finding, id: `${finding.category}-${finding.relatedField ?? finding.location}-${findings.length}` });
  const contact = resume.personal;
  if (!contact.name.trim()) add({ category: 'contact', severity: 'critical', location: 'Contact details', title: 'Name is missing', explanation: 'The resume does not identify whose experience it describes.', recommendation: 'Add the name you want employers to see.', relatedField: 'personal.name' });
  if (!contact.email.trim()) add({ category: 'contact', severity: 'critical', location: 'Contact details', title: 'Email is missing', explanation: 'A recruiter may not have a direct way to contact you.', recommendation: 'Add a professional email address.', relatedField: 'personal.email' });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) add({ category: 'contact', severity: 'critical', location: 'Contact details', title: 'Email format looks invalid', explanation: 'The email does not match a basic address format.', recommendation: 'Check the spelling and domain.', relatedField: 'personal.email' });
  if (!contact.phone.trim()) add({ category: 'contact', severity: 'warning', location: 'Contact details', title: 'Phone number is missing', explanation: 'Some employers prefer a phone contact.', recommendation: 'Add a number if you want to be contacted by phone.', relatedField: 'personal.phone' });
  if (!contact.linkedin.trim()) add({ category: 'contact', severity: 'suggestion', location: 'Contact details', title: 'LinkedIn profile is not listed', explanation: 'A professional profile can provide useful context.', recommendation: 'Add your profile URL if you maintain one.', relatedField: 'personal.linkedin' });
  for (const [field, label, value] of [['linkedin', 'LinkedIn', contact.linkedin], ['github', 'GitHub', contact.github], ['website', 'Website', contact.website]] as const) {
    if (value.trim() && !urlIsValid(value)) add({ category: 'contact', severity: 'warning', location: 'Contact details', title: `${label} URL looks invalid`, explanation: 'This link may not open correctly.', recommendation: 'Check the URL and include a valid domain.', relatedField: `personal.${field}` });
  }
  for (const section of ['experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'] as const) {
    resume[section].forEach((entry, index) => {
      for (const field of ['url', 'github', 'live'] as const) {
        const value = entry[field];
        if (typeof value === 'string' && value.trim() && !urlIsValid(value)) add({ category: 'contact', severity: 'warning', location: `${section}, entry ${index + 1}`, title: 'A resume link looks invalid', explanation: `The ${field} link may not open correctly.`, recommendation: 'Check the URL and include a valid domain.', relatedField: `${section}.${entry.id}.${field}` });
      }
    });
  }

  const profile = sectionPlainText(resume, 'profile').trim();
  if (!profile) add({ category: 'content', severity: 'warning', location: 'Profile', title: 'Profile is empty', explanation: 'There is no summary to introduce your experience.', recommendation: 'Add a concise profile, or hide the section if you do not need one.', relatedField: 'profile' });
  else if (profile.length > 1200) add({ category: 'content', severity: 'suggestion', location: 'Profile', title: 'Profile is quite long', explanation: `The profile contains ${profile.length} characters, which may be difficult to scan quickly.`, recommendation: 'Consider keeping the introduction focused and moving detail into experience.', relatedField: 'profile' });
  for (const [key, label] of [['experience', 'Experience'], ['education', 'Education'], ['skills', 'Skills']] as const) {
    if (!resume[key].length) add({ category: 'content', severity: key === 'experience' ? 'warning' : 'suggestion', location: label, title: `${label} section is empty`, explanation: `No ${label.toLowerCase()} entries were found in this resume.`, recommendation: `Add relevant ${label.toLowerCase()} or hide this section.`, relatedField: key });
  }
  for (const [key, label] of [['projects', 'Projects'], ['certifications', 'Certifications'], ['achievements', 'Achievements'], ['links', 'Links']] as const) {
    if (!resume[key].length && !resume.hiddenSections.includes(key)) add({ category: 'structure', severity: 'suggestion', location: label, title: `${label} section is empty`, explanation: `No ${label.toLowerCase()} entries were found.`, recommendation: `Add relevant ${label.toLowerCase()} if applicable, or hide this section.`, relatedField: key });
  }
  resume.experience.forEach((entry, index) => {
    const text = flattenResumeText([entry.description, ...(entry.bullets ?? [])]).trim();
    if (!text) add({ category: 'content', severity: 'warning', location: `Experience, entry ${index + 1}`, title: 'Experience description is empty', explanation: 'This entry gives little detail about the work performed.', recommendation: 'Describe the contribution using information that is accurate for you.', relatedField: `experience.${entry.id}` });
    if ((entry.bullets ?? []).some(bullet => bullet.length > 500)) add({ category: 'readability', severity: 'suggestion', location: `Experience, entry ${index + 1}`, title: 'A bullet is unusually long', explanation: 'Long bullets can be difficult to scan.', recommendation: 'Consider splitting the idea or keeping its main point concise.', relatedField: `experience.${entry.id}` });
  });
  resume.education.forEach((entry, index) => {
    if (!String(entry.degree ?? entry.name ?? '').trim() && !String(entry.institution ?? '').trim()) add({ category: 'content', severity: 'suggestion', location: `Education, entry ${index + 1}`, title: 'Education entry has little detail', explanation: 'A degree and institution were not detected.', recommendation: 'Add the relevant qualification or institution if applicable.', relatedField: `education.${entry.id}` });
  });
  const textValues = [profile, ...resume.experience.flatMap(entry => [entry.title, entry.company, entry.description, ...(entry.bullets ?? [])]), ...resume.projects.map(entry => entry.description), ...resume.skills.flatMap(entry => [entry.name, entry.title, ...(entry.items ?? [])])]
    .map(value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '').filter(value => value.length >= 24);
  const duplicate = textValues.find((value, index) => textValues.indexOf(value) !== index);
  if (duplicate) add({ category: 'consistency', severity: 'warning', location: 'Resume content', title: 'Repeated text found', explanation: 'At least one substantial line appears more than once.', recommendation: 'Review repeated lines and keep each section distinct.', relatedField: 'duplicate-text' });
  if (!findings.some(item => item.severity === 'critical' || item.severity === 'warning')) add({ category: 'structure', severity: 'good', location: 'Resume structure', title: 'Core structure looks complete', explanation: 'No critical contact or basic structure issues were detected.', recommendation: 'Review the resume for accuracy and role relevance.' });
  return findings;
}
