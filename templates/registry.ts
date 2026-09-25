export type TemplateId='modern'|'ats'|'classic'|'executive'|'sidebar';
export type TemplateDefinition={id:TemplateId;name:string;category:'Modern'|'ATS'|'Professional';layout:'two-column'|'one-column'|'compact'|'sidebar';recommended:{bodySize:number;headingSize:number;accent:string}};
export const templateRegistry:TemplateDefinition[]=[
 {id:'modern',name:'Modern two column',category:'Modern',layout:'two-column',recommended:{bodySize:14,headingSize:14,accent:'#256b61'}},
 {id:'ats',name:'Clean ATS',category:'ATS',layout:'one-column',recommended:{bodySize:14,headingSize:14,accent:'#253a35'}},
 {id:'classic',name:'Classic professional',category:'Professional',layout:'one-column',recommended:{bodySize:14,headingSize:14,accent:'#49594f'}},
 {id:'executive',name:'Compact executive',category:'Professional',layout:'compact',recommended:{bodySize:14,headingSize:14,accent:'#256b61'}},
 {id:'sidebar',name:'Modern sidebar',category:'Modern',layout:'sidebar',recommended:{bodySize:14,headingSize:14,accent:'#256b61'}}
];
export const fontRegistry=[{id:'inter',name:'Inter',css:'Inter, Arial, sans-serif',preview:'Readable neutral sans serif'},{id:'georgia',name:'Georgia',css:'Georgia, serif',preview:'Traditional serif'},{id:'arial',name:'Arial',css:'Arial, sans-serif',preview:'Classic sans serif'},{id:'times',name:'Times New Roman',css:'"Times New Roman", serif',preview:'Compact serif'}] as const;
