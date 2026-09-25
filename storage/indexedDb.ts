import { defaultResume } from '@/resume/defaults';
import { normalizeResume } from '@/resume/normalize';
import type { Resume } from '@/resume/types';
const DB = 'folio-resume-v1';
const DB_VERSION = 2;
export async function loadResume(): Promise<Resume> {
  if (typeof indexedDB === 'undefined') return defaultResume;
  return new Promise(resolve => {
    const request = indexedDB.open(DB, DB_VERSION);
    request.onupgradeneeded = () => { if(!request.result.objectStoreNames.contains('documents'))request.result.createObjectStore('documents'); };
    request.onsuccess = () => { const db=request.result;const tx = db.transaction('documents', 'readonly'); const get = tx.objectStore('documents').get('active'); get.onsuccess = () => resolve(get.result ? normalizeResume(get.result) : structuredClone(defaultResume)); get.onerror = () => resolve(structuredClone(defaultResume));tx.oncomplete=()=>db.close();tx.onerror=()=>db.close(); };
    request.onerror = () => resolve(defaultResume);
  });
}
export async function saveResume(resume: Resume): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>(resolve => { const req = indexedDB.open(DB, DB_VERSION); req.onupgradeneeded = () => { if(!req.result.objectStoreNames.contains('documents'))req.result.createObjectStore('documents'); }; req.onsuccess = () => { const tx = req.result.transaction('documents', 'readwrite'); tx.objectStore('documents').put(resume, 'active'); tx.oncomplete = () => {req.result.close();resolve();}; tx.onerror = () => {req.result.close();resolve();}; }; req.onerror = () => resolve(); });
}
