import { defaultResume } from '@/resume/defaults';
import { resumeSchema } from '@/resume/schema';
import type { Resume } from '@/resume/types';
const DB = 'folio-resume-v1';
export async function loadResume(): Promise<Resume> {
  if (typeof indexedDB === 'undefined') return defaultResume;
  return new Promise(resolve => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => { const tx = request.result.transaction('documents', 'readonly'); const get = tx.objectStore('documents').get('active'); get.onsuccess = () => { const parsed = resumeSchema.safeParse(get.result); resolve(parsed.success ? parsed.data as Resume : defaultResume); }; get.onerror = () => resolve(defaultResume); };
    request.onerror = () => resolve(defaultResume);
  });
}
export async function saveResume(resume: Resume): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>(resolve => { const req = indexedDB.open(DB, 1); req.onupgradeneeded = () => req.result.createObjectStore('documents'); req.onsuccess = () => { const tx = req.result.transaction('documents', 'readwrite'); tx.objectStore('documents').put(resume, 'active'); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); }; req.onerror = () => resolve(); });
}
