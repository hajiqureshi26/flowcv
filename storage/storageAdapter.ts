import { loadResume, loadResumeSnapshots, saveResume, saveResumeSnapshot } from './indexedDb';
import type { Resume } from '@/resume/types';
import type { ResumeSnapshot } from './indexedDb';
export interface ResumeStorage { load(id?:string):Promise<Resume>; save(resume:Resume,id?:string):Promise<void>; loadSnapshots(id?:string):Promise<ResumeSnapshot[]>; saveSnapshot(resume:Resume,id?:string):Promise<ResumeSnapshot[]> }
export function createSerializedSaver(write: (resume: Resume, id: string) => Promise<void>) {
  const pendingSaves = new Map<string, Promise<void>>();
  return async (resume: Resume, id = 'active'): Promise<void> => {
    const previous = pendingSaves.get(id) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => write(resume, id));
    pendingSaves.set(id, current);
    try {
      await current;
    } finally {
      if (pendingSaves.get(id) === current) pendingSaves.delete(id);
    }
  };
}

export const browserResumeStorage:ResumeStorage={load:loadResume,save:createSerializedSaver(saveResume),loadSnapshots:loadResumeSnapshots,saveSnapshot:saveResumeSnapshot};
