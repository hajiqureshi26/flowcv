export const A4 = { widthMm: 210, heightMm: 297 } as const;
const CSS_PX_PER_MM = 96 / 25.4;
export function pageCountForContent(totalHeightPx: number, marginMm: number): number {
  const pageContentHeight = Math.max(1, (A4.heightMm - 2 * marginMm) * CSS_PX_PER_MM);
  const contentHeight = Math.max(0, totalHeightPx - 2 * marginMm * CSS_PX_PER_MM);
  return Math.max(1, Math.ceil(contentHeight / pageContentHeight));
}

export function paginateSections<T extends string>(ids:T[],heights:Record<string,number>,capacityPx:number,firstPageUsedPx=0):T[][]{
  const pages:T[][]=[[]];let used=firstPageUsedPx;
  for(const id of ids){const height=Math.max(0,heights[id]??0);if(pages[pages.length-1].length&&used+height>capacityPx){pages.push([]);used=0;}pages[pages.length-1].push(id);used+=height;}
  return pages;
}
export type MeasuredEntry={id:string;height:number};
export type MeasuredSection={id:string;height:number;headingHeight:number;entries:MeasuredEntry[]};
export type PageChunk={id:string;entryIds?:string[];headingOnly?:boolean};
export function paginateMeasuredSections(sections:MeasuredSection[],capacityPx:number,firstPageUsedPx=0):PageChunk[][]{
  const pages:PageChunk[][]=[[]];let used=firstPageUsedPx;
  const nextPage=()=>{pages.push([]);used=0;};
  for(const section of sections){
    if(!section.entries.length){if(pages[pages.length-1].length&&used+section.height>capacityPx)nextPage();pages[pages.length-1].push({id:section.id});used+=section.height;continue;}
    for(const entry of section.entries){
      if(used+section.headingHeight+entry.height>capacityPx&&(used>0||pages[pages.length-1].length))nextPage();
      let current=pages[pages.length-1];
      if(current.length&&current[current.length-1].id===section.id&&!current[current.length-1].headingOnly){current[current.length-1].entryIds!.push(entry.id);used+=entry.height;continue;}
      current.push({id:section.id,entryIds:[],headingOnly:true});used+=section.headingHeight;
      if(used+entry.height>capacityPx&&current.length>1){nextPage();current=pages[pages.length-1];current.push({id:section.id,entryIds:[],headingOnly:true});used+=section.headingHeight;}
      current.push({id:section.id,entryIds:[entry.id]});used+=entry.height;
    }
    used+=Math.max(0,section.height-section.headingHeight-section.entries.reduce((sum,entry)=>sum+entry.height,0));
  }
  return pages;
}
