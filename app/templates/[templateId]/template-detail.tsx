'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createResume } from '@/resume/creation';
import { defaultResume } from '@/resume/defaults';
import { browserResumeStorage } from '@/storage/storageAdapter';
import { templateRegistry } from '@/templates/registry';
import TemplateDocumentPreview from '@/components/templates/TemplateDocumentPreview';
import { JourneyFooter, JourneyHeader } from '@/components/journey/SiteChrome';

export default function TemplateDetail({ templateId }: { templateId: string }) {
  const router = useRouter();
  const index = templateRegistry.findIndex(item => item.id === templateId);
  const template = templateRegistry[index];
  async function create(blank: boolean) {
    const resume = createResume(template.id, blank);
    await browserResumeStorage.save(resume, resume.id);
    router.push(`/editor?resumeId=${encodeURIComponent(resume.id)}`);
  }
  return <main className="journey-page"><JourneyHeader/><section className="journey-container template-detail">
    <Link className="journey-back" href="/templates">← All templates</Link>
    <div className="detail-grid"><div className="detail-preview"><TemplateDocumentPreview resume={defaultResume} template={template.id}/></div><div className="detail-copy"><p className="eyebrow">{template.category}{template.layout === 'compact' ? ' · COMPACT' : ''}</p><h1>{template.name}</h1><p className="journey-lead">{template.capabilities.atsFriendly ? 'A clear single-column layout designed for easy scanning and straightforward reading.' : 'A considered two-column layout that gives your experience and supporting details room to stand apart.'}</p><ul className="detail-points"><li>{template.capabilities.atsFriendly ? 'ATS-friendly structure' : 'Two-column visual hierarchy'}</li><li>Editable sections and typography</li><li>Save your own independent copy</li></ul><div className="detail-actions"><button className="journey-button journey-button-primary" onClick={()=>create(true)}>Use this template →</button><button className="journey-button journey-button-secondary" onClick={()=>create(false)}>Try sample content</button></div><p className="journey-note">A new resume is created separately. Your existing resume stays in this browser.</p><div className="detail-pagination"><Link href={`/templates/${templateRegistry[(index + templateRegistry.length - 1) % templateRegistry.length].id}`}>← Previous</Link><span>{index + 1} / {templateRegistry.length}</span><Link href={`/templates/${templateRegistry[(index + 1) % templateRegistry.length].id}`}>Next →</Link></div></div></div>
  </section><JourneyFooter/></main>;
}
