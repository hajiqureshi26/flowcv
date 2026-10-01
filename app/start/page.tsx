'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createResume } from '@/resume/creation';
import { browserResumeStorage } from '@/storage/storageAdapter';
import { JourneyFooter, JourneyHeader } from '@/components/journey/SiteChrome';

export default function StartPage() {
  const router = useRouter();
  async function startBlank() {
    const resume = createResume('modern', true);
    await browserResumeStorage.save(resume, resume.id);
    router.push(`/editor?resumeId=${encodeURIComponent(resume.id)}`);
  }
  return <main className="journey-page"><JourneyHeader/><section className="journey-container start-content">
    <p className="eyebrow">A GOOD PLACE TO BEGIN</p><h1>How would you like to start?</h1><p className="journey-lead">Pick a path. You can change the design and details as you go.</p>
    <div className="start-options">
      <button className="start-option start-option-primary" onClick={startBlank}><span className="start-icon" aria-hidden="true">＋</span><span><strong>Start with a blank resume</strong><small>Build it section by section, with your own content.</small></span><span aria-hidden="true">→</span></button>
      <Link className="start-option" href="/templates"><span className="start-icon" aria-hidden="true">▤</span><span><strong>Choose a template</strong><small>Start from a designed layout with example content.</small></span><span aria-hidden="true">→</span></Link>
      <Link className="start-option" href="/import"><span className="start-icon" aria-hidden="true">⇧</span><span><strong>Import an existing resume</strong><small>Bring a PDF or DOCX and review what was extracted.</small></span><span aria-hidden="true">→</span></Link>
      <Link className="start-option" href="/editor"><span className="start-icon" aria-hidden="true">✦</span><span><strong>Use AI assistance</strong><small>Open the builder and review AI suggestions when you&apos;re ready.</small></span><span aria-hidden="true">→</span></Link>
    </div><p className="journey-note">Your resume is saved in this browser. AI features send selected resume content to the service when you use them.</p>
  </section><JourneyFooter/></main>;
}
