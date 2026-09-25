import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultResume } from '../resume/defaults';
import { loadResume, saveResume } from '../storage/indexedDb';

describe('IndexedDB resume storage',()=>{
  beforeEach(async()=>{await new Promise<void>(resolve=>{const req=indexedDB.deleteDatabase('folio-resume-v1');req.onsuccess=()=>resolve();req.onerror=()=>resolve();req.onblocked=()=>resolve();});});
  it('saves and restores content across loads',async()=>{
    const resume=structuredClone(defaultResume);resume.personal.name='Saved Candidate';resume.experience[0].title='Persisted role';
    await saveResume(resume);
    const restored=await loadResume();
    expect(restored.personal.name).toBe('Saved Candidate');
    expect(restored.experience[0].title).toBe('Persisted role');
  });
});
