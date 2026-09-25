export type RichText = string;
export type Entry = { id: string; [key: string]: string | boolean | string[] };
export type SectionKey = 'profile' | 'experience' | 'education' | 'projects' | 'skills' | 'certifications' | 'achievements' | 'links' | 'custom';
export type Resume = {
  id: string; updatedAt: string; personal: { name: string; title: string; email: string; phone: string; location: string; linkedin: string; github: string; website: string };
  profile: RichText; experience: Entry[]; education: Entry[]; projects: Entry[]; skills: Entry[]; certifications: Entry[]; achievements: Entry[]; links: Entry[]; custom: Entry[];
  sectionsOrder: SectionKey[]; hiddenSections: SectionKey[];
  settings: { template: string; font: string; nameSize: number; titleSize: number; headingSize: number; bodySize: number; lineHeight: number; letterSpacing: number; margin: number; sectionGap: number; entryGap: number; accent: string; divider: string; text: string; skillsLayout: string; headerLayout: string };
};
