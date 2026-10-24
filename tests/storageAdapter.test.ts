import { describe, expect, it, vi } from 'vitest';
import type { Resume } from '../resume/types';
import { defaultResume } from '../resume/defaults';
import { createSerializedSaver } from '../storage/storageAdapter';

describe('serialized resume persistence', () => {
  it('orders saves for one document and continues after a failed write', async () => {
    const write = vi.fn<(resume: Resume, id: string) => Promise<void>>();
    const finish: Array<() => void> = [];
    let call = 0;
    write.mockImplementation(() => new Promise<void>((resolve, reject) => {
      const index = call++;
      finish[index] = index === 0 ? () => reject(new Error('first save failed')) : () => resolve();
    }));
    const save = createSerializedSaver(write);

    const first = save(structuredClone(defaultResume), 'candidate');
    const latest = structuredClone(defaultResume);
    latest.personal.name = 'Latest';
    const second = save(latest, 'candidate');
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);

    finish[0]();
    await expect(first).rejects.toThrow('first save failed');
    await Promise.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(2);
    finish[1]();
    await expect(second).resolves.toBeUndefined();
  });

  it('keeps writes for separate resumes independent', async () => {
    const write = vi.fn<(resume: Resume, id: string) => Promise<void>>().mockResolvedValue(undefined);
    const save = createSerializedSaver(write);
    await Promise.all([
      save(structuredClone(defaultResume), 'one'),
      save(structuredClone(defaultResume), 'two'),
    ]);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
