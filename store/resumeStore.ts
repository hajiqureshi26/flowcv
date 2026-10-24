'use client';
import { create } from 'zustand';
import type { Resume } from '@/resume/types';
import { defaultResume } from '@/resume/defaults';
type Store = { resume: Resume; ready: boolean; canUndo:boolean; canRedo:boolean; past:Resume[]; future:Resume[]; lastHistoryAt:number; setResume: (r: Resume) => void; update: (fn: (r: Resume) => Resume) => void; restore: (r: Resume) => void; undo:()=>void; redo:()=>void };
const HISTORY_LIMIT = 60;
const HISTORY_GROUP_MS = 900;
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every(key => Object.hasOwn(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
export const useResumeStore = create<Store>((set, get) => ({
  resume: structuredClone(defaultResume), ready: false, canUndo:false, canRedo:false, past:[], future:[], lastHistoryAt:0,
  setResume: resume => set({ resume }),
  update: fn => set(s => {
    const next = fn(s.resume);
    if (next === s.resume || sameValue(next, s.resume)) return s;
    const now = Date.now();
    const past = now - s.lastHistoryAt < HISTORY_GROUP_MS ? s.past : [...s.past.slice(-(HISTORY_LIMIT - 1)), structuredClone(s.resume)];
    return { resume: { ...next, updatedAt: new Date().toISOString() }, canUndo:true, canRedo:false, past, future:[], lastHistoryAt:now };
  }),
  restore: resume => set({ resume, ready: true, canUndo:false, canRedo:false, past:[], future:[], lastHistoryAt:0 }),
  undo: () => { const state=get(); if(!state.past.length)return; const past=[...state.past],resume=past.pop()!;set({resume,past, future:[...state.future.slice(-(HISTORY_LIMIT - 1)),structuredClone(state.resume)],canUndo:past.length>0,canRedo:true,lastHistoryAt:0}); },
  redo: () => { const state=get();if(!state.future.length)return;const future=[...state.future],resume=future.pop()!;set({resume,past:[...state.past.slice(-(HISTORY_LIMIT - 1)),structuredClone(state.resume)],future,canUndo:true,canRedo:future.length>0,lastHistoryAt:0}); }
}));
