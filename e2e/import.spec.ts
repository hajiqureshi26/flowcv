import { test, expect, type Page } from '@playwright/test';

function importedResume() {
  return {
    id: 'imported-pdf-resume', updatedAt: '2026-10-01T00:00:00Z',
    personal: { name: 'Imported Candidate', title: 'Product Engineer', email: 'imported@example.com', phone: '', location: '', linkedin: '', github: '', website: '' },
    profile: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A verified profile from the source document.' }] }] },
    experience: [{ id: 'source-exp', description: 'Built accessible product workflows.' }], education: [], projects: [], skills: [], certifications: [], achievements: [], links: [],
    custom: [{ id: 'source-raw', title: 'Unclassified extracted content', content: 'Source details retained for review.' }],
    sectionsOrder: ['profile', 'experience', 'education', 'projects', 'skills', 'certifications', 'achievements', 'links', 'custom'], hiddenSections: [],
    settings: { template: 'modern', font: 'inter', nameSize: 34, titleSize: 16, headingSize: 14, bodySize: 15, lineHeight: 1.45, letterSpacing: 0, margin: 18, sectionGap: 15, entryGap: 10, accent: '#256b61', divider: '#dfe5e2', dividerStyle: 'thin', text: '#263a36', skillsLayout: 'tags', headerLayout: 'left' },
  };
}

async function seedDocuments(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('folio-resume-v1', 2);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('documents')) request.result.createObjectStore('documents'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const record = (name: string) => ({ version: 1, resume: { id: name, personal: { name }, settings: { template: 'modern' } } });
      store.put(record('Resume A'), 'active');
      store.put(record('Template Resume'), 'template-sample');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

async function expectStored(page: Page, key: string, name: string) {
  const storedName = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('folio-resume-v1', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('documents', 'readonly').objectStore('documents').get(id);
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!value || typeof value !== 'object') return undefined;
    const record = value as { resume?: { personal?: { name?: unknown } }; personal?: { name?: unknown } };
    const name = record.resume?.personal?.name ?? record.personal?.name;
    return typeof name === 'string' ? name : undefined;
  }, key);
  expect(storedName).toBe(name);
}

for (const format of [
  { label: 'PDF', extension: 'pdf', mime: 'application/pdf', endpoint: '/api/imports/pdf' },
  { label: 'DOCX', extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', endpoint: '/api/imports/docx' },
]) {
  test(`${format.label} import is reviewed, isolated, editable, and restored after reload`, async ({ page }) => {
    await page.goto('/import');
    await seedDocuments(page);
    await page.route(`**${format.endpoint}`, route => route.fulfill({ json: importedResume() }));
    await page.getByLabel('Choose a PDF or DOCX resume').setInputFiles({ name: `candidate.${format.extension}`, mimeType: format.mime, buffer: Buffer.from('test source bytes') });
    await page.getByRole('button', { name: 'Continue to review →' }).click();
    await expect(page.getByRole('heading', { name: 'Review what we found.' })).toBeVisible();
    await expect(page.getByText('Imported Candidate')).toBeVisible();
    await expect(page.getByText('Source details retained for review.')).toBeVisible();
    await page.getByRole('button', { name: 'Use this resume →' }).click();
    await expect(page).toHaveURL(/\/editor\?resumeId=/);
    await expect(page.locator('.page-frame .paper').first()).toContainText('Imported Candidate');
    const importedId = new URL(page.url()).searchParams.get('resumeId');
    expect(importedId).toBeTruthy();
    expect(importedId).not.toBe('imported-pdf-resume');
    await expectStored(page, 'active', 'Resume A');
    await expectStored(page, 'template-sample', 'Template Resume');
    await expectStored(page, importedId!, 'Imported Candidate');

    await page.getByRole('button', { name: 'Edit personal details' }).click();
    await page.getByLabel('Full name').fill('Edited Imported Candidate');
    await page.waitForTimeout(700);
    await page.reload();
    await expect(page.locator('.page-frame .paper').first()).toContainText('Edited Imported Candidate');
    await page.evaluate(() => { (window as Window & { __printCalled?: boolean }).print = () => { (window as Window & { __printCalled?: boolean }).__printCalled = true; }; });
    await page.getByRole('button', { name: 'Export PDF' }).click();
    await expect.poll(() => page.evaluate(() => (window as Window & { __printCalled?: boolean }).__printCalled)).toBe(true);
  });
}
