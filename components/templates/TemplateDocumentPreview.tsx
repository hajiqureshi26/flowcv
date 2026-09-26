import type { CSSProperties } from 'react';
import type { Entry, Resume, SectionKey } from '@/resume/types';
import { fontRegistry } from '@/templates/registry';

const sectionTitles: Record<SectionKey, string> = {
  profile: 'Profile', experience: 'Experience', education: 'Education', projects: 'Projects',
  skills: 'Skills', certifications: 'Certifications', achievements: 'Achievements', links: 'Links', custom: 'Additional',
};

export default function TemplateDocumentPreview({ resume, template }: { resume: Resume; template: string }) {
  const twoColumn = template === 'modern' || template === 'sidebar';
  const secondary: SectionKey[] = ['skills', 'education', 'certifications', 'links'];
  const order = resume.sectionsOrder.filter(id => !resume.hiddenSections.includes(id));
  const renderSection = (id: SectionKey) => {
    if (id === 'profile') {
      const text = resume.profile.content.flatMap(node => node.content ?? []).map(node => node.text ?? '').join(' ');
      return text.trim() ? <section className="resume-section" key={id}><h2>{sectionTitles[id]}</h2><p>{text}</p></section> : null;
    }
    const entries = resume[id] as Entry[];
    if (!entries.length) return null;
    return <section className="resume-section" key={id}><h2>{sectionTitles[id]}</h2>{entries.map(entry => <div className="resume-entry" key={entry.id}>
      {id === 'experience' && <><strong>{entry.title}</strong><div className="entry-sub">{entry.company}{entry.location ? ` | ${entry.location}` : ''}</div><p>{entry.start}{entry.start && (entry.end || entry.current) ? ' - ' : ''}{entry.current ? 'Present' : entry.end}</p>{entry.bullets?.slice(0, 2).map((item, index) => <p key={index}>• {item}</p>)}</>}
      {id === 'education' && <><strong>{entry.degree}</strong><div className="entry-sub">{entry.institution}</div><p>{entry.start}{entry.start && entry.end ? ' - ' : ''}{entry.end}</p></>}
      {id === 'projects' && <><strong>{entry.name}</strong><div className="entry-sub">{entry.role} {entry.technologies}</div><p>{typeof entry.description === 'string' ? entry.description : ''}</p></>}
      {id === 'skills' && <><strong>{entry.category}</strong><p>{Array.isArray(entry.items) ? entry.items.join(' · ') : entry.items}</p></>}
      {id === 'certifications' && <><strong>{entry.name}</strong><div className="entry-sub">{entry.issuer} {entry.date}</div></>}
      {id === 'achievements' && <><strong>{entry.title}</strong><div className="entry-sub">{entry.date}</div></>}
      {id === 'links' && <><strong>{entry.label}</strong><div className="entry-sub">{entry.url}</div></>}
      {id === 'custom' && <><strong>{entry.title}</strong><p>{entry.content}</p></>}
    </div>)}</section>;
  };
  const settings = resume.settings;
  const style = {
    fontFamily: fontRegistry.find(font => font.id === settings.font)?.css ?? fontRegistry[0].css,
    fontSize: '13px', lineHeight: settings.lineHeight, padding: '14mm', width: '210mm', minHeight: '297mm',
    '--accent': settings.accent, '--divider': settings.divider, '--ink': settings.text,
    '--section-gap': '10px', '--entry-gap': '6px', '--name-size': '27px', '--title-size': '14px', '--heading-size': '12px',
  } as CSSProperties;
  return <article className={`paper template-${template} divider-${settings.dividerStyle} live-template-paper`} style={style}>
    <header className={`resume-header header-${settings.headerLayout}`}><h1>{resume.personal.name || 'Your name'}</h1><p className="resume-title">{resume.personal.title || 'Professional title'}</p><div className="contact-line">{[resume.personal.email,resume.personal.phone,resume.personal.location].filter(Boolean).join(' | ')}</div></header>
    {twoColumn ? <div className="resume-columns"><aside className="resume-sidebar">{order.filter(id => secondary.includes(id)).map(renderSection)}</aside><div className="resume-main">{order.filter(id => !secondary.includes(id)).map(renderSection)}</div></div> : <div className="resume-main">{order.map(renderSection)}</div>}
  </article>;
}
