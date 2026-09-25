export type RichTextNode = { type: string; text?: string; attrs?: Record<string, string | number | boolean | null>; marks?: { type: string; attrs?: Record<string, string> }[]; content?: RichTextNode[] };
export type RichText = { type: 'doc'; content: RichTextNode[] };
export type EntryValue = string | boolean | string[] | RichText;
export type Entry = { id: string; title?:string;company?:string;location?:string;start?:string;end?:string;current?:boolean;description?:string|RichText;bullets?:string[];url?:string;degree?:string;institution?:string;grade?:string;name?:string;role?:string;technologies?:string;github?:string;live?:string;category?:string;items?:string[]|string;issuer?:string;date?:string;credentialId?:string;label?:string;achievement?:string;content?:string;[key:string]:EntryValue|undefined };
export type SectionKey = 'profile' | 'experience' | 'education' | 'projects' | 'skills' | 'certifications' | 'achievements' | 'links' | 'custom';
export type Resume = {
  id: string; updatedAt: string; personal: { name: string; title: string; email: string; phone: string; location: string; linkedin: string; github: string; website: string };
  profile: RichText; experience: Entry[]; education: Entry[]; projects: Entry[]; skills: Entry[]; certifications: Entry[]; achievements: Entry[]; links: Entry[]; custom: Entry[];
  sectionsOrder: SectionKey[]; hiddenSections: SectionKey[];
  settings: { template: string; font: string; nameSize: number; titleSize: number; headingSize: number; bodySize: number; lineHeight: number; letterSpacing: number; margin: number; sectionGap: number; entryGap: number; accent: string; divider: string; dividerStyle:'none'|'thin'|'medium'|'styled'; text: string; skillsLayout: string; headerLayout: string };
};
