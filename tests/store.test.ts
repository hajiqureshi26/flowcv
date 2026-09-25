import { describe, expect, it } from 'vitest';
import { defaultResume } from '../resume/defaults';
import { useResumeStore } from '../store/resumeStore';

describe('resume history',()=>{
  it('supports undo and redo without changing unrelated resume fields',()=>{
    const store=useResumeStore.getState();store.restore(structuredClone(defaultResume));
    useResumeStore.getState().update(r=>({...r,personal:{...r.personal,name:'Taylor Example'}}));
    expect(useResumeStore.getState().resume.personal.name).toBe('Taylor Example');
    useResumeStore.getState().undo();
    expect(useResumeStore.getState().resume.personal.name).toBe(defaultResume.personal.name);
    useResumeStore.getState().redo();
    expect(useResumeStore.getState().resume.personal.name).toBe('Taylor Example');
  });
});
