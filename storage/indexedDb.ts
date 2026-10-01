import { defaultResume } from '@/resume/defaults';
import { normalizeResume } from '@/resume/normalize';
import type { Resume } from '@/resume/types';

const DB = 'folio-resume-v1';
const DB_VERSION = 2;
const DOCUMENT_VERSION = 1;
type StoredDocument = { version: number; resume: unknown };
export type ResumeSnapshot = { id: string; createdAt: string; resume: Resume };
const MAX_RESUME_SNAPSHOTS = 12;

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

export async function loadResume(id = 'active'): Promise<Resume> {
  if (typeof indexedDB === 'undefined') return structuredClone(defaultResume);
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db!.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').get(id);
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

export async function saveResume(resume: Resume, id = 'active'): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      transaction.objectStore('documents').put({ version: DOCUMENT_VERSION, resume } satisfies StoredDocument, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Resume could not be saved'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Resume save was interrupted'));
    });
  } finally {
    db.close();
  }
}

function historyKey(id: string) { return `history:${id}`; }

export async function loadResumeSnapshots(id = 'active'): Promise<ResumeSnapshot[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').get(historyKey(id));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Resume history could not be read'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Resume history read was interrupted'));
    });
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ResumeSnapshot => Boolean(item && typeof item === 'object' && 'resume' in item && 'createdAt' in item))
      .map(item => ({ ...item, resume: normalizeResume(item.resume) }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function saveResumeSnapshot(resume: Resume, id = 'active'): Promise<ResumeSnapshot[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDatabase();
  try {
    return await new Promise<ResumeSnapshot[]>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const request = store.get(historyKey(id));
      let snapshots: ResumeSnapshot[] = [];
      request.onsuccess = () => {
        const prior = Array.isArray(request.result) ? request.result as ResumeSnapshot[] : [];
        const snapshot: ResumeSnapshot = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          resume: normalizeResume(structuredClone(resume)),
        };
        snapshots = [snapshot, ...prior].slice(0, MAX_RESUME_SNAPSHOTS);
        store.put(snapshots, historyKey(id));
      };
      request.onerror = () => reject(request.error ?? new Error('Resume snapshot could not be created'));
      transaction.oncomplete = () => resolve(snapshots);
      transaction.onerror = () => reject(transaction.error ?? new Error('Resume snapshot could not be saved'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Resume snapshot save was interrupted'));
    });
  } finally {
    db.close();
  }
}
