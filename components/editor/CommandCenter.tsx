'use client';

import type { Resume } from '@/resume/types';
import { analyzeResumeHealth } from '@/frontend/ai/health';
import { templateRegistry } from '@/templates/registry';

export default function CommandCenter({ resume, saving, pageCount, analysis, onHealth, onCopilot, onDesign, onPreview, onExport, onPalette }: { resume: Resume; saving: string; pageCount: number; analysis: { jdAttached: boolean; jdAnalyzed: boolean; atsAnalyzed: boolean; stale: boolean; pendingSuggestion: boolean }; onHealth: () => void; onCopilot: () => void; onDesign: () => void; onPreview: () => void; onExport: () => void; onPalette: () => void }) {
  const findings = analyzeResumeHealth(resume);
  const issues = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'warning').length;
  const template = templateRegistry.find((item) => item.id === resume.settings.template);
  const hasContent = Boolean(resume.personal.name && (resume.experience.length || resume.projects.length || resume.education.length || resume.skills.length));
  return <section className="command-center" aria-label="Command Center">
    <div className="command-center-title"><div><p className="eyebrow">DOCUMENT CONTROL</p><h2>Command Center</h2></div><button type="button" onClick={onPalette}>⌘K · Commands</button></div>
    <div className="command-status-grid">
      <div><span>Document</span><strong>{resume.personal.name || 'Untitled resume'}</strong><small>{saving === 'Saved' ? 'Saved on this device' : saving}</small></div>
      <div><span>Health</span><strong>{issues ? `${issues} items to review` : 'No critical issues'}</strong><small>{findings.length} local checks · no prediction</small></div>
      <div><span>Design</span><strong>{template?.name ?? resume.settings.template}</strong><small>{template?.capabilities.atsFriendly ? 'ATS friendly' : `${template?.capabilities.columns ?? 1} columns`}</small></div>
      <div><span>Export</span><strong>{hasContent ? 'Ready to preview' : 'Add resume content'}</strong><small>{pageCount} {pageCount === 1 ? 'page' : 'pages'} · PDF preview</small></div>
    </div>
    <details className="command-more"><summary>Job and AI status</summary><div className="command-status-grid">
      <div><span>Job description</span><strong>{analysis.jdAttached ? 'Attached in this session' : 'None attached'}</strong><small>{analysis.jdAnalyzed ? 'Analysis available' : 'Not analyzed'}</small></div>
      <div><span>ATS review</span><strong>{analysis.atsAnalyzed ? 'Reviewed' : 'Not reviewed'}</strong><small>{analysis.stale ? 'Resume changed since analysis' : 'Current session state'}</small></div>
      <div><span>Review queue</span><strong>{analysis.pendingSuggestion ? 'Suggestion pending' : 'No pending suggestion'}</strong><small>Accept or reject in Copilot</small></div>
    </div></details>
    <div className="command-actions"><button type="button" onClick={onHealth}>Review health</button><button type="button" onClick={onCopilot}>Open Copilot</button><button type="button" onClick={onDesign}>Design Lab</button><button type="button" onClick={onPreview}>Open preview</button><button type="button" onClick={onExport}>Download PDF</button></div>
  </section>;
}
