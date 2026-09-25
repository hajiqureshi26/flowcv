'use client';
import { create } from 'zustand';
import type { Resume } from '@/resume/types';
import { defaultResume } from '@/resume/defaults';
type Store = { resume: Resume; ready: boolean; canUndo:boolean; canRedo:boolean; past:Resume[]; future:Resume[]; setResume: (r: Resume) => void; update: (fn: (r: Resume) => Resume) => void; restore: (r: Resume) => void; undo:()=>void; redo:()=>void };
export const useResumeStore = create<Store>((set, get) => ({
  resume: structuredClone(defaultResume), ready: false, canUndo:false, canRedo:false, past:[], future:[],
  setResume: resume => set({ resume }),
  update: fn => set(s => ({ resume: { ...fn(s.resume), updatedAt: new Date().toISOString() }, canUndo:true, canRedo:false, past:[...s.past.slice(-99), structuredClone(s.resume)], future:[] })),
  restore: resume => set({ resume, ready: true, canUndo:false, canRedo:false, past:[], future:[] }),
  undo: () => { const state=get(); if(!state.past.length)return; const past=[...state.past],resume=past.pop()!;set({resume,past, future:[...state.future,structuredClone(state.resume)],canUndo:past.length>0,canRedo:true}); },
  redo: () => { const state=get();if(!state.future.length)return;const future=[...state.future],resume=future.pop()!;set({resume,past:[...state.past,structuredClone(state.resume)],future,canUndo:true,canRedo:future.length>0}); }
}));
