import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportFlow from '@/components/import/ImportFlow';
import { ApiError, importApi } from '@/frontend/api/client';
import { defaultResume } from '@/resume/defaults';
import { loadResume, saveResume } from '@/storage/indexedDb';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

async function clearDatabase() {
  await new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase('folio-resume-v1');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

beforeEach(async () => { await clearDatabase(); pushMock.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('resume import review and confirmation', () => {
  it('keeps existing and template resumes intact and saves the import with a fresh ID', async () => {
    const existing = structuredClone(defaultResume);
    existing.personal.name = 'Resume A';
    await saveResume(existing);
    const template = structuredClone(defaultResume);
    template.id = 'template-copy';
    template.personal.name = 'Template sample';
    await saveResume(template, template.id);

    const extracted = structuredClone(defaultResume);
    extracted.personal.name = 'Imported Candidate';
    extracted.personal.email = 'candidate@example.com';
    extracted.custom = [{ id: 'unclassified', title: 'Unclassified extracted content', content: 'Original text that needs review.' }];
    vi.spyOn(importApi, 'pdf').mockResolvedValue(extracted);

    render(<ImportFlow/>);
    fireEvent.change(screen.getByLabelText('Choose a PDF or DOCX resume'), {
      target: { files: [new File(['%PDF-1.7'], 'candidate.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    expect(await screen.findByRole('heading', { name: 'Review what we found.' })).toBeInTheDocument();
    expect(screen.getByText('Original text that needs review.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this resume →' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const route = String(pushMock.mock.calls[0][0]);
    const importedId = new URL(route, 'http://localhost').searchParams.get('resumeId');
    expect(importedId).toBeTruthy();
    expect(importedId).not.toBe('imported-pdf-resume');
    expect((await loadResume()).personal.name).toBe('Resume A');
    expect((await loadResume('template-copy')).personal.name).toBe('Template sample');
    const imported = await loadResume(importedId!);
    expect(imported.id).toBe(importedId);
    expect(imported.personal.name).toBe('Imported Candidate');
    expect(imported.custom[0].content).toBe('Original text that needs review.');
  });

  it('rejects unsupported files before calling the import service', async () => {
    const upload = vi.spyOn(importApi, 'pdf');
    render(<ImportFlow/>);
    fireEvent.change(screen.getByLabelText('Choose a PDF or DOCX resume'), {
      target: { files: [new File(['plain text'], 'candidate.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('This file type isn’t supported');
    expect(upload).not.toHaveBeenCalled();
  });

  it('shows extraction errors and retries the selected file', async () => {
    const extracted = structuredClone(defaultResume);
    extracted.personal.name = 'Recovered Import';
    const upload = vi.spyOn(importApi, 'pdf')
      .mockRejectedValueOnce(new ApiError('Could not extract readable text from the PDF', 400))
      .mockResolvedValueOnce(extracted);
    render(<ImportFlow/>);
    fireEvent.change(screen.getByLabelText('Choose a PDF or DOCX resume'), {
      target: { files: [new File(['%PDF-1.7'], 'candidate.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not extract readable text');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Review what we found.' })).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('rejects oversized files in the browser before upload', async () => {
    const upload = vi.spyOn(importApi, 'pdf');
    render(<ImportFlow/>);
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Choose a PDF or DOCX resume'), { target: { files: [oversized] } });
    expect(screen.getByRole('alert')).toHaveTextContent('This file is too large');
    expect(upload).not.toHaveBeenCalled();
  });
});
