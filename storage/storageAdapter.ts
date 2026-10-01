import { loadResume, loadResumeSnapshots, saveResume, saveResumeSnapshot } from './indexedDb';
import type { Resume } from '@/resume/types';
import type { ResumeSnapshot } from './indexedDb';
export interface ResumeStorage { load(id?:string):Promise<Resume>; save(resume:Resume,id?:string):Promise<void>; loadSnapshots(id?:string):Promise<ResumeSnapshot[]>; saveSnapshot(resume:Resume,id?:string):Promise<ResumeSnapshot[]> }
export const browserResumeStorage:ResumeStorage={load:loadResume,save:saveResume,loadSnapshots:loadResumeSnapshots,saveSnapshot:saveResumeSnapshot};
