'use client';
import { create } from 'zustand';
import type { Resume } from '@/resume/types';
import { defaultResume } from '@/resume/defaults';
type Store = { resume: Resume; ready: boolean; setResume: (r: Resume) => void; update: (fn: (r: Resume) => Resume) => void; restore: (r: Resume) => void };
export const useResumeStore = create<Store>((set) => ({ resume: defaultResume, ready: false, setResume: resume => set({ resume }), update: fn => set(s => ({ resume: { ...fn(s.resume), updatedAt: new Date().toISOString() } })), restore: resume => set({ resume, ready: true }) }));
