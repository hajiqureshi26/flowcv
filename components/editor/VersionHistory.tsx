'use client';
import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import type { Resume } from '@/resume/types';
import { browserResumeStorage } from '@/storage/storageAdapter';
import type { ResumeSnapshot } from '@/storage/indexedDb';

export default function VersionHistory({ resume, resumeId, onClose, onRestore }: { resume: Resume; resumeId: string; onClose: () => void; onRestore: (resume: Resume) => void }) {
  const [snapshots, setSnapshots] = useState<ResumeSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function reload() { setSnapshots(await browserResumeStorage.loadSnapshots(resumeId)); }
  useEffect(() => {
    let active = true;
    browserResumeStorage.loadSnapshots(resumeId).then(value => { if (active) setSnapshots(value); }).catch(() => {
      if (active) setMessage('Could not read recovery history from this browser. Check available storage and try again.');
    });
    return () => { active = false; };
  }, [resumeId]);

  async function createSnapshot() {
    setBusy(true); setMessage('');
    try { setSnapshots(await browserResumeStorage.saveSnapshot(resume, resumeId)); setMessage('Recovery snapshot saved in this browser.'); }
    catch { setMessage('Could not save a recovery snapshot. Check available browser storage and try again.'); }
    finally { setBusy(false); }
  }

  async function restoreSnapshot(snapshot: ResumeSnapshot) {
    setBusy(true); setMessage('');
    try {
      await browserResumeStorage.saveSnapshot(resume, resumeId);
      await browserResumeStorage.save(snapshot.resume, resumeId);
      onRestore(snapshot.resume);
      setMessage('Resume restored. A snapshot of the previous version was kept.');
      await reload();
    } catch { setMessage('Could not restore this version. Your current resume remains unchanged.'); }
    finally { setBusy(false); }
  }

  return <Dialog titleId="version-history-title" onClose={onClose} className="history-dialog">
    <div className="history-head"><div><p className="eyebrow">LOCAL RECOVERY</p><h2 id="version-history-title">Version history</h2></div><button type="button" className="history-close" onClick={onClose} aria-label="Close version history">Close</button></div>
    <p className="history-description">Snapshots stay in this browser and are limited to the latest 12. Undo and redo remain available for recent edits.</p>
    <button className="journey-button journey-button-primary" type="button" onClick={createSnapshot} disabled={busy}>Save a recovery snapshot</button>
    {message && <p className="history-message" role="status">{message}</p>}
    {snapshots.length === 0 ? <p className="history-empty">No recovery snapshots yet. Save one before a major edit to make a restore point.</p> : <ol className="history-list">{snapshots.map(snapshot => <li key={snapshot.id}><div><strong>{snapshot.resume.personal.name || 'Untitled resume'}</strong><time dateTime={snapshot.createdAt}>{new Date(snapshot.createdAt).toLocaleString()}</time></div><button type="button" className="history-restore" disabled={busy} onClick={() => restoreSnapshot(snapshot)}>Restore</button></li>)}</ol>}
  </Dialog>;
}
