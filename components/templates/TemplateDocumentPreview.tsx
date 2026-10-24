import type { CSSProperties } from 'react';
import type { Entry, Resume, SectionKey } from '@/resume/types';
import { fontRegistry } from '@/templates/registry';
import RichTextView, { richTextIsEmpty } from '@/components/rich-text/RichTextView';

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
      return !richTextIsEmpty(resume.profile) ? <section className="resume-section" key={id}><h2>{sectionTitles[id]}</h2><RichTextView value={resume.profile}/></section> : null;
    }
    const entries = resume[id] as Entry[];
    if (!entries.length) return null;
    return <section className="resume-section" key={id}><h2>{sectionTitles[id]}</h2>{entries.map(entry => <div className="resume-entry" key={entry.id}>
      {id === 'experience' && <><strong>{entry.title}</strong><div className="entry-sub">{entry.company}{entry.location ? ` | ${entry.location}` : ''}</div><p>{entry.start}{entry.start && (entry.end || entry.current) ? ' - ' : ''}{entry.current ? 'Present' : entry.end}</p><RichDescription value={entry.description}/><ResumeBullets value={entry.bullets}/></>}
      {id === 'education' && <><div className="entry-head"><strong>{entry.degree}</strong><span>{entry.start}{entry.start && entry.end ? ' - ' : ''}{entry.end}</span></div><div className="entry-sub"><b>{entry.institution}</b>{entry.location ? ` | ${entry.location}` : ''}</div>{entry.grade&&<p>{entry.grade}</p>}<RichDescription value={entry.description}/></>}
      {id === 'projects' && <><strong>{entry.name}</strong><div className="entry-sub">{entry.role} {entry.technologies}</div><RichDescription value={entry.description}/><ResumeBullets value={entry.bullets}/></>}
      {id === 'skills' && <><strong>{entry.category}</strong>{settings.skillsLayout === 'tags' ? <div className="skill-tags">{(Array.isArray(entry.items) ? entry.items : String(entry.items || '').split(',')).map((item, index) => <span key={index}>{item}</span>)}</div> : settings.skillsLayout === 'columns' ? <ul className="skill-columns">{(Array.isArray(entry.items) ? entry.items : String(entry.items || '').split(',')).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="skill-list">{Array.isArray(entry.items) ? entry.items.join(settings.skillsLayout === 'inline' ? ' · ' : ', ') : entry.items}</p>}</>}
      {id === 'certifications' && <><strong>{entry.name}</strong><div className="entry-sub">{entry.issuer} {entry.date}</div></>}
      {id === 'achievements' && <><strong>{entry.title}</strong><div className="entry-sub">{entry.date}</div><RichDescription value={entry.description}/></>}
      {id === 'links' && <><strong>{entry.label}</strong><div className="entry-sub">{entry.url}</div></>}
      {id === 'custom' && <><strong>{entry.title}</strong><p>{entry.content}</p></>}
    </div>)}</section>;
  };
  const settings = resume.settings;
  const style = {
    fontFamily: fontRegistry.find(font => font.id === settings.font)?.css ?? fontRegistry[0].css,
    fontSize: `${settings.bodySize}px`, lineHeight: settings.lineHeight, padding: `${settings.margin}mm`, width: '210mm', minHeight: '297mm', letterSpacing: `${settings.letterSpacing}px`,
    '--accent': settings.accent, '--divider': settings.divider, '--ink': settings.text,
    '--section-gap': `${settings.sectionGap}px`, '--entry-gap': `${settings.entryGap}px`, '--name-size': `${settings.nameSize}px`, '--title-size': `${settings.titleSize}px`, '--heading-size': `${settings.headingSize}px`,
  } as CSSProperties;
  return <article className={`paper template-${template} divider-${settings.dividerStyle} live-template-paper`} style={style}>
    <header className={`resume-header header-${settings.headerLayout}`}><h1>{resume.personal.name || 'Your name'}</h1><p className="resume-title">{resume.personal.title || 'Professional title'}</p><div className="contact-line">{[resume.personal.email,resume.personal.phone,resume.personal.location,resume.personal.linkedin,resume.personal.github,resume.personal.website].filter(Boolean).map((item,index)=><span key={index}>{item}</span>)}</div></header>
    {twoColumn ? <div className="resume-columns"><aside className="resume-sidebar">{order.filter(id => secondary.includes(id)).map(renderSection)}</aside><div className="resume-main">{order.filter(id => !secondary.includes(id)).map(renderSection)}</div></div> : <div className="resume-main">{order.map(renderSection)}</div>}
  </article>;
}
function RichDescription({value}:{value:unknown}){if(!value)return null;if(typeof value==='object'&&!Array.isArray(value)&&'type'in value&&value.type==='doc')return <RichTextView value={value as Resume['profile']}/>;return <p>{String(value)}</p>;}
function ResumeBullets({value}:{value:unknown}){const items=Array.isArray(value)?value:String(value||'').split('\n');const clean=items.map(String).filter(item=>item.trim());return clean.length?<ul>{clean.map((item,index)=><li key={index}>{item}</li>)}</ul>:null;}
