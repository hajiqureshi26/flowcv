'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useResumeStore } from '@/store/resumeStore';
import { browserResumeStorage } from '@/storage/storageAdapter';
import { templateRegistry } from '@/templates/registry';
import TemplateDocumentPreview from '@/components/templates/TemplateDocumentPreview';

const descriptions:Record<string,string>={modern:'Balanced, expressive, and easy to scan.',ats:'A clear single column built for readability.',classic:'A timeless typographic structure.',executive:'More room for a detailed career story.',sidebar:'A confident sidebar with a focused content column.'};
const list=templateRegistry.map(template=>({...template,desc:descriptions[template.id]}));
const filters=['All','ATS','Modern','Professional'];
export default function Templates(){
 const {resume,update,restore}=useResumeStore();const router=useRouter();const [filter,setFilter]=useState('All');const [preview,setPreview]=useState<string|null>(null);
 useEffect(()=>{browserResumeStorage.load().then(restore);},[restore]);
 const selected=list.find(x=>x.id===preview);
 async function applyTemplate(id:string){const next={...resume,settings:{...resume.settings,template:id}};update(()=>next);await browserResumeStorage.save(next);router.push('/');}
 return <main className="template-page"><header><Link href="/" className="brand"><span className="brand-mark">f</span> folio<span className="brand-dot">.</span></Link><Link href="/" className="back-link">← Back to editor</Link></header><section className="template-content"><p className="eyebrow">THE TEMPLATE COLLECTION</p><h1>Find your format.</h1><p className="template-intro">Every layout keeps your content intact. Pick a style and keep building.</p><div className="template-filters" aria-label="Filter templates">{filters.map(name=><button key={name} className={filter===name?'chosen':''} aria-pressed={filter===name} onClick={()=>setFilter(name)}>{name}{name==='All'&&<span>5</span>}</button>)}</div><div className="template-grid">{list.filter(t=>filter==='All'||t.category===filter).map(t=><article className="template-card" key={t.id}><button className={`template-thumb thumb-${t.id}`} aria-label={`Preview ${t.name}`} onClick={()=>setPreview(t.id)}><div className="thumb-page"><div className="thumb-name"/><div className="thumb-meta"/><div className="thumb-rule"/><div className="thumb-body"><aside><i/><i/><i/><i/></aside><div><b/><i/><i/><i/><b/><i/><i/><i/></div></div></div></button><div className="template-meta"><div><h2>{t.name}</h2><span>{t.category}</span></div><button className="preview-action" title={`Preview ${t.name}`} onClick={()=>setPreview(t.id)}>↗</button></div><p>{t.desc}</p><button className={`use-template ${resume.settings.template===t.id?'using':''}`} onClick={()=>applyTemplate(t.id)}>{resume.settings.template===t.id?'Currently using':'Use this template'} <span>→</span></button></article>)}</div></section>
 {selected&&<div className="modal-backdrop" role="presentation" onClick={()=>setPreview(null)}><section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close preview" onClick={()=>setPreview(null)}>×</button><div className="live-template-preview"><TemplateDocumentPreview resume={resume} template={selected.id}/></div><h2 id="preview-title">{selected.name}</h2><p>{selected.desc}</p><button className="use-template" onClick={()=>applyTemplate(selected.id)}>Use this template <span>→</span></button></section></div>}
 </main>
}
