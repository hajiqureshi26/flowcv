import { describe, expect, it } from 'vitest';
import { defaultResume } from '../resume/defaults';
import { resumeSchema } from '../resume/schema';
import { normalizeResume } from '../resume/normalize';
import { pageCountForContent, paginateSections, paginateMeasuredSections, A4 } from '../renderer/paginationEngine';

describe('resume foundation', () => {
  it('provides stable IDs and a valid default document', () => {
    expect(resumeSchema.safeParse(defaultResume).success).toBe(true);
    expect(new Set(defaultResume.experience.map(entry => entry.id)).size).toBe(defaultResume.experience.length);
  });
  it('keeps content independent of selected template', () => {
    const first = structuredClone(defaultResume);
    const second = { ...first, settings: { ...first.settings, template: 'classic' } };
    expect(second.experience).toEqual(first.experience);
    expect(resumeSchema.safeParse(second).success).toBe(true);
  });
  it('preserves rich text marks and links in the portable document model',()=>{
    const rich={...defaultResume,profile:{type:'doc' as const,content:[{type:'paragraph',content:[{type:'text',text:'bold',marks:[{type:'bold'}]},{type:'text',text:' site',marks:[{type:'link',attrs:{href:'https://example.com'}}]}]}]}};
    expect(resumeSchema.safeParse(rich).success).toBe(true);
  });
  it('validates email and resume links while allowing optional empty values',()=>{
    const empty=structuredClone(defaultResume);
    empty.personal.email='';empty.personal.linkedin='';
    expect(resumeSchema.safeParse(empty).success).toBe(true);
    const invalidEmail={...empty,personal:{...empty.personal,email:'not-an-email'}};
    expect(resumeSchema.safeParse(invalidEmail).success).toBe(false);
    const invalidLink={...empty,links:[{id:'link-bad',label:'Portfolio',url:'javascript:alert(1)'}]};
    expect(resumeSchema.safeParse(invalidLink).success).toBe(false);
  });
  it('migrates older text summaries and raises tiny stored fonts to the readable minimum',()=>{
    const old={...structuredClone(defaultResume),profile:'Previously saved summary',experience:defaultResume.experience.map((entry,index)=>index===0?{...entry,description:'Old plain description'}:entry),settings:{...defaultResume.settings,bodySize:9}};
    const normalized=normalizeResume(old);
    expect(normalized.profile.content[0].content?.[0].text).toBe('Previously saved summary');
    expect((normalized.experience[0].description as {content:{content:{text?:string}[]}[]} ).content[0].content[0].text).toBe('Old plain description');
    expect(normalized.settings.bodySize).toBe(15);
  });
  it('computes one, two and three A4 pages from measured content height',()=>{
    const usable=A4.heightMm-36;const px=96/25.4;
    expect(pageCountForContent(A4.heightMm*px,18)).toBe(1);
    expect(pageCountForContent((A4.heightMm+usable)*px,18)).toBe(2);
    expect(pageCountForContent((A4.heightMm+usable*2)*px,18)).toBe(3);
  });
  it('paginates measured sections into separate ordered pages',()=>{
    expect(paginateSections(['profile','experience','projects'],{profile:240,experience:470,projects:320},600,150)).toEqual([['profile'],['experience'],['projects']]);
  });
  it('splits a long section between stable entry IDs and repeats its heading',()=>{
    const pages=paginateMeasuredSections([{id:'experience',height:1300,headingHeight:30,entries:[1,2,3,4].map(n=>({id:`job-${n}`,height:300}))}],600,200);
    expect(pages.map(page=>page.flatMap(chunk=>chunk.entryIds??[]))).toEqual([['job-1'],['job-2'],['job-3'],['job-4']]);
    expect(pages.every(page=>page[0]?.headingOnly)).toBe(true);
  });
});
