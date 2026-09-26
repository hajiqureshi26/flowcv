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
  it('writes a versioned record and continues to read existing raw resume records',async()=>{
    const saved=structuredClone(defaultResume);saved.personal.name='Versioned Candidate';
    await saveResume(saved);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('folio-resume-v1',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const stored=await new Promise<unknown>((resolve,reject)=>{const tx=db.transaction('documents','readonly');const request=tx.objectStore('documents').get('active');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    expect(stored).toMatchObject({version:1,resume:{personal:{name:'Versioned Candidate'}}});
    const legacy={...saved,personal:{...saved.personal,name:'Legacy Candidate'}};
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(legacy,'active');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
    db.close();
    expect((await loadResume()).personal.name).toBe('Legacy Candidate');
  });
});
