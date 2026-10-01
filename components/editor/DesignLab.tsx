'use client';

import { templateRegistry, fontRegistry } from '@/templates/registry';
import type { Resume } from '@/resume/types';

type Settings = Resume['settings'];
type Preset = { label: string; template: Settings['template']; font: Settings['font']; accent: string; bodySize: number; headingSize: number; nameSize: number; margin: number; sectionGap: number; entryGap: number; lineHeight: number; dividerStyle: Settings['dividerStyle'] };

const presets: Preset[] = [
  { label: 'ATS Clean', template: 'ats', font: 'arial', accent: '#253a35', bodySize: 15, headingSize: 14, nameSize: 32, margin: 18, sectionGap: 13, entryGap: 8, lineHeight: 1.4, dividerStyle: 'thin' },
  { label: 'Modern', template: 'modern', font: 'inter', accent: '#256b61', bodySize: 15, headingSize: 14, nameSize: 34, margin: 18, sectionGap: 15, entryGap: 10, lineHeight: 1.45, dividerStyle: 'thin' },
  { label: 'Professional', template: 'classic', font: 'georgia', accent: '#49594f', bodySize: 15, headingSize: 15, nameSize: 35, margin: 20, sectionGap: 16, entryGap: 11, lineHeight: 1.5, dividerStyle: 'medium' },
  { label: 'Compact', template: 'executive', font: 'arial', accent: '#256b61', bodySize: 15, headingSize: 13, nameSize: 30, margin: 14, sectionGap: 9, entryGap: 6, lineHeight: 1.3, dividerStyle: 'thin' },
  { label: 'Executive', template: 'classic', font: 'georgia', accent: '#253a35', bodySize: 16, headingSize: 15, nameSize: 38, margin: 22, sectionGap: 18, entryGap: 12, lineHeight: 1.5, dividerStyle: 'styled' },
];

export function applyDesignPreset(current: Settings, label: string): Settings {
  const preset = presets.find((item) => item.label === label);
  if (!preset) return current;
  return { ...current, ...preset };
}

export default function DesignLab({ settings, onChange }: { settings: Settings; onChange: (settings: Settings) => void }) {
  const set = (key: keyof Settings, value: string | number) => onChange({ ...settings, [key]: value });
  const reset = () => {
    const template = templateRegistry.find((item) => item.id === settings.template) ?? templateRegistry[0];
    onChange({ ...settings, ...template.recommended, font: 'inter', nameSize: 34, titleSize: 16, bodySize: template.recommended.bodySize, headingSize: template.recommended.headingSize, lineHeight: 1.45, letterSpacing: 0, margin: 18, sectionGap: 15, entryGap: 10, divider: '#dfe5e2', dividerStyle: 'thin', text: '#263a36', headerLayout: 'left' });
  };
  const selectedTemplate = templateRegistry.find((item) => item.id === settings.template) ?? templateRegistry[0];
  return <section className="design-lab" aria-labelledby="design-lab-title">
    <div className="design-lab-heading"><div><p className="eyebrow">PRESENTATION</p><h2 id="design-lab-title">Design Lab</h2></div><button type="button" onClick={reset}>Reset to template defaults</button></div>
    <p className="design-lab-note">Design changes affect appearance only. Resume content stays intact.</p>
    <div className="design-presets" role="group" aria-label="Design presets">{presets.map((preset) => <button type="button" key={preset.label} aria-pressed={settings.template === preset.template && settings.accent === preset.accent && settings.bodySize === preset.bodySize} onClick={() => onChange(applyDesignPreset(settings, preset.label))}>{preset.label}</button>)}</div>
    <div className="design-controls">
      <label>Template<select aria-label="Template" value={settings.template} onChange={(event) => set('template', event.target.value)}>{templateRegistry.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Font<select aria-label="Font" value={settings.font} onChange={(event) => set('font', event.target.value)}>{fontRegistry.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Body size · {settings.bodySize}px<input aria-label="Body size" type="range" min="15" max="20" value={settings.bodySize} onChange={(event) => set('bodySize', +event.target.value)}/></label>
      <label>Heading size · {settings.headingSize}px<input aria-label="Heading size" type="range" min="12" max="18" value={settings.headingSize} onChange={(event) => set('headingSize', +event.target.value)}/></label>
      <label>Page margin · {settings.margin}mm<input aria-label="Page margin" type="range" min="10" max="28" value={settings.margin} onChange={(event) => set('margin', +event.target.value)}/></label>
      <label>Section spacing · {settings.sectionGap}px<input aria-label="Section spacing" type="range" min="8" max="28" value={settings.sectionGap} onChange={(event) => set('sectionGap', +event.target.value)}/></label>
      <label>Density<select aria-label="Resume density" value={settings.entryGap} onChange={(event) => set('entryGap', +event.target.value)}><option value={6}>Compact</option><option value={10}>Comfortable</option><option value={16}>Spacious</option></select></label>
      <label>Accent color<input aria-label="Accent color" type="color" value={settings.accent} onChange={(event) => set('accent', event.target.value)}/></label>
      <label>Divider style<select aria-label="Divider style" value={settings.dividerStyle} onChange={(event) => set('dividerStyle', event.target.value)}><option value="none">None</option><option value="thin">Thin</option><option value="medium">Medium</option><option value="styled">Styled</option></select></label>
      <label>Header alignment<select aria-label="Header alignment" value={settings.headerLayout} onChange={(event) => set('headerLayout', event.target.value)}><option value="left">Left</option><option value="center">Centered</option></select></label>
    </div>
    <small>{selectedTemplate.capabilities.atsFriendly ? 'ATS friendly layout' : `${selectedTemplate.capabilities.columns} column layout`}</small>
  </section>;
}
