'use client';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, importApi, RequestCancelledError } from '@/frontend/api/client';
import { normalizeResume } from '@/resume/normalize';
import type { Resume, SectionKey } from '@/resume/types';
import { browserResumeStorage } from '@/storage/storageAdapter';

type Phase = 'idle' | 'selected' | 'uploading' | 'review' | 'creating' | 'complete' | 'error';
const MAX_FILE_SIZE = Number(process.env.NEXT_PUBLIC_IMPORT_MAX_FILE_SIZE_BYTES) || 10 * 1024 * 1024;
const sectionNames: Record<SectionKey, string> = { profile: 'Profile', experience: 'Experience', education: 'Education', projects: 'Projects', skills: 'Skills', certifications: 'Certifications', achievements: 'Achievements', links: 'Links', custom: 'Other extracted content' };
const sections: SectionKey[] = ['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'];

function validateFile(file: File): string | null {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'docx') return 'This file type isn’t supported. Please choose a PDF or DOCX file.';
  if (file.size === 0) return 'This file is empty. Choose a non-empty PDF or DOCX file.';
  if (file.size > MAX_FILE_SIZE) return `This file is too large. The limit is ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`;
  const type = file.type.toLowerCase();
  const allowed = extension === 'pdf'
    ? ['', 'application/pdf', 'application/x-pdf', 'application/octet-stream']
    : ['', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'];
  if (!allowed.includes(type)) return 'The file content type does not match a supported PDF or DOCX document.';
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof RequestCancelledError) return 'Import cancelled. No resume was created.';
  if (error instanceof ApiError) {
    if (error.status === 413) return `This file is too large. The limit is ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`;
    if (error.status === 415) return 'This file type isn’t supported. Please upload a PDF or DOCX.';
    if (error.status === 400) return error.message || 'We couldn’t extract readable resume content from this document.';
    if (error.status >= 500) return 'The import service is temporarily unavailable. Please try again.';
    return error.message || 'We couldn’t process this document. Please review the file and try again.';
  }
  if (error instanceof Error && error.message.includes('timed out')) return 'Processing took too long. Please try again with the same file or a smaller document.';
  if (error instanceof Error && error.message.includes('Network')) return 'We couldn’t reach the import service. Check your connection and try again.';
  return error instanceof Error ? error.message : 'We couldn’t process this document. Please try again.';
}

function entryLabel(entry: Resume['experience'][number]): string {
  const values = [entry.title, entry.name, entry.degree, entry.institution, entry.company, entry.category, entry.issuer, entry.date, entry.label, entry.role, entry.content, entry.description];
  const text = values.map(value => typeof value === 'string' ? value : value && typeof value === 'object' && 'content' in value ? value.content.map(node => node.content?.map(child => child.text ?? '').join('') ?? '').join(' ') : '').filter(Boolean).join(' · ');
  return text || 'Content detected';
}

function newResumeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function ImportFlow() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  function chooseFile(next: File | undefined) {
    if (!next) return;
    setError(''); setResume(null); setFile(next);
    const validation = validateFile(next);
    if (validation) { setPhase('error'); setError(validation); return; }
    setPhase('selected');
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]);
  }

  async function processImport() {
    if (!file) return;
    const validation = validateFile(file);
    if (validation) { setPhase('error'); setError(validation); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(''); setPhase('uploading');
    try {
      const extracted = file.name.toLowerCase().endsWith('.pdf')
        ? await importApi.pdf(file, controller.signal)
        : await importApi.docx(file, controller.signal);
      const candidate = normalizeResume(extracted);
      const totalEntries = sections.reduce((sum, key) => sum + (key === 'profile' ? 0 : candidate[key].length), 0);
      const hasProfile = candidate.profile.content.some(node => node.content?.some(child => Boolean(child.text?.trim())));
      if (!totalEntries && !hasProfile && !candidate.personal.name && !candidate.personal.email && !candidate.personal.phone) {
        throw new Error('We couldn’t find enough resume content to build an editable resume. This may be a scanned or image-only PDF.');
      }
      setResume(candidate); setPhase('review'); setFile(null);
    } catch (cause) {
      if (controllerRef.current !== controller) return;
      setPhase('error'); setError(errorMessage(cause));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancelImport() {
    controllerRef.current?.abort();
  }

  async function confirmImport() {
    if (!resume) return;
    setPhase('creating'); setError('');
    const independent = normalizeResume({ ...structuredClone(resume), id: newResumeId(), updatedAt: new Date().toISOString() });
    try {
      await browserResumeStorage.save(independent, independent.id);
    } catch {
      setPhase('review'); setError('Your resume was extracted, but it could not be saved in this browser. Check available storage and try again.');
      return;
    }
    setPhase('complete');
    router.push(`/editor?resumeId=${encodeURIComponent(independent.id)}`);
  }

  function reset() {
    controllerRef.current?.abort(); controllerRef.current = null; setPhase('idle'); setFile(null); setResume(null); setError('');
  }

  return <section className="import-flow" aria-live="polite">
    <p className="eyebrow">IMPORT A RESUME</p>
    <h1>{phase === 'review' ? 'Review what we found.' : phase === 'complete' ? 'Your resume is ready.' : 'Bring your resume with you.'}</h1>
    {phase !== 'review' && <p className="journey-lead">Upload a PDF or DOCX. We’ll extract its content into an editable resume and show you what we recognized before saving.</p>}

    {(phase === 'idle' || phase === 'selected' || phase === 'error') && <>
      <div className={`import-dropzone ${dragging ? 'is-dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={onDrop}>
        <span className="import-file-icon" aria-hidden="true">↑</span>
        <strong>{file ? file.name : 'Drag and drop your resume here'}</strong>
        <span>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB · ${file.name.split('.').pop()?.toUpperCase()}` : 'PDF or DOCX · up to ' + Math.round(MAX_FILE_SIZE / (1024 * 1024)) + ' MB'}</span>
        <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFileChange} aria-label="Choose a PDF or DOCX resume" />
        <button className="journey-button journey-button-secondary" type="button" onClick={() => inputRef.current?.click()}>Choose file</button>
      </div>
      {error && <div role="alert" className="import-error"><strong>Import needs attention</strong><p>{error}</p><div className="import-actions"><button className="journey-button journey-button-secondary" onClick={reset}>Choose another file</button>{file && !validateFile(file) && <button className="journey-button journey-button-primary" onClick={processImport}>Try again</button>}</div></div>}
      {phase === 'selected' && <div className="import-actions"><button className="journey-button journey-button-primary" onClick={processImport}>Continue to review →</button><button className="journey-button journey-button-secondary" onClick={reset}>Remove file</button></div>}
    </>}

    {phase === 'uploading' && <div className="import-progress" role="status"><span className="import-spinner" aria-hidden="true"/><div><strong>Uploading and extracting content…</strong><p>The import service is reading the document and preparing a structured resume. This can take a little while.</p></div><button className="journey-button journey-button-secondary" onClick={cancelImport}>Cancel import</button></div>}

    {phase === 'review' && resume && <div className="import-review">
      <p className="review-intro">Check the detected details and sections. Nothing is saved until you choose <strong>Use this resume</strong>.</p>
      <section className="review-card"><h2>Personal details</h2><dl>{(['name', 'title', 'email', 'phone', 'location'] as const).map(key => <div key={key}><dt>{key === 'name' ? 'Name' : key[0].toUpperCase() + key.slice(1)}</dt><dd>{resume.personal[key] || <span className="review-missing">Not detected</span>}</dd></div>)}</dl></section>
      <section className="review-card"><h2>Detected sections</h2><div className="review-sections">{sections.filter(key => key !== 'custom').map(key => {
        const count = key === 'profile' ? (resume.profile.content.length ? 1 : 0) : resume[key].length;
        const populated = key === 'profile' ? count > 0 : count > 0;
        return <div key={key} className={populated ? 'is-detected' : 'is-missing'}><span aria-hidden="true">{populated ? '✓' : '!'}</span><strong>{sectionNames[key]}</strong><small>{populated ? (key === 'profile' ? 'Content detected' : `${count} ${count === 1 ? 'entry' : 'entries'}`) : 'Not detected'}</small></div>;
      })}</div></section>
      {resume.custom.length > 0 && <section className="review-card review-unclassified"><h2>Other extracted content</h2><p>Some text could not be confidently placed in a resume section. Review it here; it remains in the new resume under Other extracted content.</p>{resume.custom.map(entry => <pre key={entry.id}>{String(entry.content ?? entry.description ?? entry.title ?? '')}</pre>)}</section>}
      <section className="review-card"><h2>Extracted content preview</h2><div className="review-content">{sections.filter(key => key !== 'custom' && key !== 'profile').flatMap(key => resume[key].map(entry => <p key={`${key}-${entry.id}`}><strong>{sectionNames[key]}:</strong> {entryLabel(entry)}</p>))}{resume.profile.content.flatMap(node => node.content ?? []).map((node, index) => node.text ? <p key={`profile-${index}`}><strong>Profile:</strong> {node.text}</p> : null)}</div></section>
      {error && <div role="alert" className="import-error"><p>{error}</p></div>}
      <div className="import-actions"><button className="journey-button journey-button-primary" onClick={confirmImport}>Use this resume →</button><button className="journey-button journey-button-secondary" onClick={reset}>Discard and choose another</button></div>
      <p className="journey-note">The original file is not saved. Only the confirmed Resume JSON is stored in this browser.</p>
    </div>}

    {phase === 'creating' && <div className="import-progress" role="status"><span className="import-spinner" aria-hidden="true"/><strong>Preparing your editor…</strong></div>}
    {phase === 'complete' && <p role="status">Resume saved. Opening the editor…</p>}
    <p className="import-privacy">Text extraction runs through the configured import service. Scanned or image-only PDFs need OCR, which this version does not provide.</p>
  </section>;
}
