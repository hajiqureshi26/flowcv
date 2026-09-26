import { defaultResume } from '@/resume/defaults';
import { normalizeResume } from '@/resume/normalize';
import type { Resume } from '@/resume/types';

const DB = 'folio-resume-v1';
const DB_VERSION = 2;
const DOCUMENT_VERSION = 1;
type StoredDocument = { version: number; resume: unknown };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('documents')) {
        request.result.createObjectStore('documents');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Resume storage is unavailable'));
  });
}

export async function loadResume(): Promise<Resume> {
  if (typeof indexedDB === 'undefined') return structuredClone(defaultResume);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db!.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').get('active');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Resume could not be read'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Resume read was interrupted'));
    });
    if (!value) return structuredClone(defaultResume);
    // Read the original raw-resume format as well as the versioned envelope.
    const candidate = typeof value === 'object' && value !== null && 'resume' in value
      ? (value as StoredDocument).resume
      : value;
    return normalizeResume(candidate);
  } catch {
    return structuredClone(defaultResume);
  } finally {
    db?.close();
  }
}

export async function saveResume(resume: Resume): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put({ version: DOCUMENT_VERSION, resume } satisfies StoredDocument, 'active');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Resume could not be saved'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Resume save was interrupted'));
    });
  } finally {
    db.close();
  }
}
