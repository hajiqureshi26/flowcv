import { defaultResume } from './defaults';
import type { Resume } from './types';
import { resumeSchema } from './schema';

/** Keep recoverable user fields when a stored document has an older/partial shape. */
export function normalizeResume(value: unknown): Resume {
  if (!value || typeof value !== 'object') return structuredClone(defaultResume);
  const raw = value as Record<string, unknown>;
  const base = structuredClone(defaultResume) as Resume;
  const candidate: Record<string, unknown> = { ...base, ...raw, personal: { ...base.personal, ...(raw.personal && typeof raw.personal === 'object' ? raw.personal : {}) }, settings: { ...base.settings, ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) } };
  for (const key of ['experience','education','projects','skills','certifications','achievements','links','custom'] as const) {
    if (Array.isArray(raw[key])) candidate[key] = raw[key].map(item=>{
      if(!item||typeof item!=='object')return item;
      const entry={...(item as Record<string,unknown>)};
      if(typeof entry.description==='string')entry.description={type:'doc',content:entry.description?entry.description.split(/\n+/).map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]})):[]};
      return entry;
    });
  }
  if (typeof raw.profile === 'string') candidate.profile = { type: 'doc', content: raw.profile ? raw.profile.split(/\n+/).map(text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })) : [] };
  else if (!raw.profile || typeof raw.profile !== 'object' || (raw.profile as {type?:unknown}).type !== 'doc') candidate.profile = base.profile;
  if (!Array.isArray(candidate.sectionsOrder)) candidate.sectionsOrder = base.sectionsOrder;
  else candidate.sectionsOrder = [...new Set([...(candidate.sectionsOrder as string[]).filter(x => base.sectionsOrder.includes(x as Resume['sectionsOrder'][number])), ...base.sectionsOrder])];
  if (!Array.isArray(candidate.hiddenSections)) candidate.hiddenSections = [];
  const parsed = resumeSchema.safeParse(candidate);
  if (parsed.success) return parsed.data as Resume;
  // Structural repair only: preserve the user's entries and values while repairing IDs/order.
  for (const key of ['experience','education','projects','skills','certifications','achievements','links','custom'] as const) {
    if (!Array.isArray(candidate[key])) candidate[key] = [];
    candidate[key] = (candidate[key] as Record<string, unknown>[]).filter(x => x && typeof x === 'object').map((x,i) => ({ ...x, id: typeof x.id === 'string' && x.id ? x.id : `${key}-${i}-${Date.now()}` }));
  }
  candidate.personal = { ...base.personal, ...(candidate.personal as object) };
  candidate.settings = { ...base.settings, ...(candidate.settings as object) };
  const settings = candidate.settings as Record<string, unknown>;
  for (const [key,min,max] of [['nameSize',24,48],['titleSize',12,22],['headingSize',12,20],['bodySize',15,20],['lineHeight',1.1,1.8],['letterSpacing',-1,2],['margin',10,28],['sectionGap',8,28],['entryGap',6,24]] as const) {
    const value=Number(settings[key]);settings[key]=Number.isFinite(value)?Math.min(max,Math.max(min,value)):base.settings[key as keyof Resume['settings']];
  }
  if(!['modern','ats','classic','executive','sidebar'].includes(String(settings.template)))settings.template=base.settings.template;
  if(!['inter','georgia','arial','times'].includes(String(settings.font)))settings.font=base.settings.font;
  if(!['tags','inline','grouped','columns'].includes(String(settings.skillsLayout)))settings.skillsLayout=base.settings.skillsLayout;
  if(!['left','center'].includes(String(settings.headerLayout)))settings.headerLayout=base.settings.headerLayout;
  candidate.sectionsOrder = base.sectionsOrder;
  candidate.hiddenSections = [];
  return candidate as Resume;
}
