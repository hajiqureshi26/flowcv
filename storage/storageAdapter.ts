import { loadResume, saveResume } from './indexedDb';
import type { Resume } from '@/resume/types';
export interface ResumeStorage { load():Promise<Resume>; save(resume:Resume):Promise<void> }
export const browserResumeStorage:ResumeStorage={load:loadResume,save:saveResume};
