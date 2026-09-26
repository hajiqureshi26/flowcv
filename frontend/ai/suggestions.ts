import type { Resume, SectionKey } from '@/resume/types';
import type { TailoringSuggestion } from './types';

type ReplaceResult = { value: unknown; replaced: boolean };

/** A proposed text change that is only applied after the user accepts it. */
export type ResumeTextSuggestion = {
  section: SectionKey;
  entry_id?: string | null;
  original_content: string;
  suggested_content: string;
};

function replaceFirst(value: unknown, original: string, suggested: string): ReplaceResult {
  if (typeof value === 'string') {
    if (!value.includes(original)) return { value, replaced: false };
    return { value: value.replace(original, suggested), replaced: true };
  }
  if (Array.isArray(value)) {
    let replaced = false;
    const result = value.map((item) => {
      if (replaced) return item;
      const next = replaceFirst(item, original, suggested);
      replaced = next.replaced;
      return next.value;
    });
    return { value: result, replaced };
  }
  if (typeof value === 'object' && value !== null) {
    let replaced = false;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!replaced && key !== 'id') {
        const next = replaceFirst(item, original, suggested);
        result[key] = next.value;
        replaced = next.replaced;
      } else {
        result[key] = item;
      }
    }
    return { value: result, replaced };
  }
  return { value, replaced: false };
}

/**
 * Apply one reviewed suggestion to a copy of the Resume JSON.
 *
 * Returns `null` when the suggestion cannot be matched, so callers leave the
 * stored resume untouched instead of writing a fabricated change.
 */
export function applyResumeTextSuggestion(resume: Resume, suggestion: ResumeTextSuggestion): Resume | null {
  if (!suggestion.original_content || !suggestion.suggested_content.trim()) return null;
  const nextResume = structuredClone(resume);
  if (suggestion.section === 'profile') {
    const replaced = replaceFirst(nextResume.profile, suggestion.original_content, suggestion.suggested_content);
    if (!replaced.replaced) return null;
    nextResume.profile = replaced.value as Resume['profile'];
    return nextResume;
  }

  const entries = nextResume[suggestion.section];
  const target = suggestion.entry_id
    ? entries.find((entry) => entry.id === suggestion.entry_id)
    : entries.find((entry) => JSON.stringify(entry).includes(suggestion.original_content));
  if (!target) return null;
  const replaced = replaceFirst(target, suggestion.original_content, suggestion.suggested_content);
  if (!replaced.replaced) return null;
  const index = entries.findIndex((entry) => entry.id === target.id);
  const updatedEntries = [...entries];
  updatedEntries[index] = replaced.value as (typeof entries)[number];
  (nextResume[suggestion.section] as typeof updatedEntries) = updatedEntries;
  return nextResume;
}

/** Tailoring suggestions carry the section and (optionally) the entry they came from. */
export function applyTailoringSuggestion(resume: Resume, suggestion: TailoringSuggestion): Resume | null {
  return applyResumeTextSuggestion(resume, suggestion);
}

/** Resume-assistant results only identify the section, so the entry is matched by content. */
export function applyResumeImproveSuggestion(
  resume: Resume,
  section: SectionKey,
  originalContent: string,
  suggestedContent: string,
): Resume | null {
  return applyResumeTextSuggestion(resume, {
    section,
    original_content: originalContent,
    suggested_content: suggestedContent,
  });
}
