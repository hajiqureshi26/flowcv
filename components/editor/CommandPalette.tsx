'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';

const commands = [
  ['Open Copilot', 'Open contextual AI suggestions', 'copilot'],
  ['Review resume health', 'Check structure and completeness', 'health'],
  ['Open Design Lab', 'Change template and visual settings', 'design'],
  ['Show preview', 'Switch to resume preview', 'preview'],
  ['Export PDF', 'Print or save as PDF', 'export'],
  ['Undo change', 'Undo the last resume update', 'undo'],
  ['Redo change', 'Restore the last undone update', 'redo'],
] as const;

export type EditorCommand = typeof commands[number][2];
export default function CommandPalette({ onRun, onClose }: { onRun: (command: EditorCommand) => void; onClose: () => void }) {
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => commands.filter(([label, description]) => `${label} ${description}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  useEffect(() => { search.current?.focus(); }, []);
  return <Dialog titleId="command-palette-title" onClose={onClose} className="command-palette">
      <h2 id="command-palette-title">What would you like to do?</h2>
      <input ref={search} type="search" aria-label="Search commands" placeholder="Search actions" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); (event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[data-command]'))?.focus(); } if (event.key === 'Enter' && matches.length === 1) onRun(matches[0][2]); }}/>
      {matches.map(([label, description, command]) => <button data-command type="button" key={command} onClick={() => onRun(command)}><strong>{label}</strong><span>{description}</span></button>)}
      {!matches.length && <p role="status">No matching commands.</p>}
      <button className="command-palette-close" type="button" onClick={onClose}>Close</button>
  </Dialog>;
}
