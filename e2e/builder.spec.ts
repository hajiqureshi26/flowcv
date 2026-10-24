import { test, expect } from '@playwright/test';

test('landing, editor, and template detail flow are reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your next chapter starts with a clear story/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import resume' })).toHaveAttribute('href', '/import');
  await expect(page.getByRole('link', { name: 'Already have a resume? Import a PDF or DOCX.' })).toHaveAttribute('href', '/import');
  await page.getByRole('link', { name: /Create your resume/ }).first().click();
  await expect(page.getByRole('heading', { name: 'How would you like to start?' })).toBeVisible();
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Build your resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit personal details' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('.page-frame .paper').first()).toHaveCSS('font-size','15px');
  await page.locator('.customize-toggle').click();
  await expect(page.locator('.settings-panel select').first()).toBeVisible();
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Find your format.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Clean ATS' })).toBeVisible();
  await page.getByRole('button', { name: 'Modern', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Modern two column' })).toBeVisible();
  await page.getByRole('link', { name: /Modern two column/ }).click();
  await expect(page.getByRole('heading', { name: 'Modern two column' })).toBeVisible();
  await expect(page.locator('.detail-preview .resume-header')).toContainText('Alex Morgan');
  await page.getByRole('button',{name:/Use this template/}).click();
  await expect(page).toHaveURL(/\/editor\?resumeId=/);
  await expect(page.locator('.page-frame .paper').first()).toHaveClass(/template-modern/);
});

test('mobile journey menu exposes working navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  await menu.click();
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.journey-header nav').getByRole('link', { name: 'Templates', exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.getByRole('heading', { name: 'Find your format.' })).toBeVisible();
});

test('template detail supports previous and next navigation', async ({ page }) => {
  await page.goto('/templates/modern');
  await expect(page.getByRole('heading', { name: 'Modern two column' })).toBeVisible();
  await page.getByRole('link', { name: 'Next →' }).click();
  await expect(page).toHaveURL(/\/templates\/ats$/);
  await expect(page.getByRole('heading', { name: 'Clean ATS' })).toBeVisible();
  await page.goto('/templates/not-a-template');
  await expect(page.getByRole('heading', { name: /We couldn.t find that design/ })).toBeVisible();
});

test('local version history restores a snapshot and preserves the previous version', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('dialog', { name: 'Version history' })).toBeVisible();
  await page.getByRole('button', { name: 'Save a recovery snapshot' }).click();
  await expect(page.locator('.history-message')).toContainText('Recovery snapshot saved');
  await page.getByRole('button', { name: 'Close version history' }).click();
  await page.getByRole('button', { name: 'Edit personal details' }).click();
  await page.getByLabel('Full name').fill('Temporary Edit');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.locator('.page-frame .paper').first()).toContainText('Alex Morgan');
  await expect(page.locator('.page-frame .paper').first()).not.toContainText('Temporary Edit');
  await expect(page.locator('.history-message')).toContainText('A snapshot of the previous version was kept');
});

test('editor and template surfaces do not cause page-level horizontal overflow', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/start', '/import', '/editor', '/templates', '/templates/modern']) {
      await page.goto(route);
      const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(widths.document, `${route} at ${width}px; body ${widths.body}px`).toBeLessThanOrEqual(widths.viewport);
    }
  }
});

test('sections can be removed from the layout and restored without losing their content', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Remove Education from resume' }).click();
  await expect(page.locator('.section-card').filter({ hasText: 'Education' })).toHaveCount(0);
  await page.getByLabel('Choose a section to add').selectOption('education');
  await page.getByRole('button', { name: 'Add section' }).click();
  const education = page.locator('.section-card').filter({ hasText: 'Education' });
  await expect(education).toBeVisible();
  await expect(page.getByLabel('Degree')).toHaveValue('BFA, Communication Design');
  await expect(page.getByRole('button', { name: 'Hide Education in preview' })).toHaveAttribute('aria-pressed', 'true');
});

test('mobile editor can switch to the readable A4 preview',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/editor');
  await page.getByRole('tab',{name:'Preview',exact:true}).click();
  await expect(page.locator('.page-frame .paper').first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Zoom in'})).toBeVisible();
});

test('rich text toolbar supports underline formatting', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Edit personal details' }).click();
  const toolbar = page.locator('.format-bar').first();
  const editor = page.locator('.tiptap').first();
  await editor.click();
  await page.keyboard.type('hello');
  await page.keyboard.press('Control+A');
  await toolbar.getByRole('button', { name: 'Underline' }).click();
  await expect(toolbar.getByRole('button', { name: 'Underline' })).toHaveAttribute('aria-pressed', 'true');
});

test('personal details autosave and restore from IndexedDB',async({page})=>{
  await page.goto('/editor');
  await page.getByRole('button',{name:'Edit personal details'}).click();
  await page.getByLabel('Email').fill('candidate@example.org');
  await page.waitForTimeout(900);
  await expect(page.locator('.doc-title span')).toContainText('Saved on this device');
  await page.reload();
  await page.getByRole('button',{name:'Edit personal details'}).click();
  await expect(page.getByLabel('Email')).toHaveValue('candidate@example.org');
});

test('long resumes paginate into three or more A4 sheets',async({page})=>{
  await page.goto('/editor');
  await expect(page.locator('.page-frame').first()).toBeVisible();
  await page.waitForTimeout(900);
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('folio-resume-v1',2);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('documents','readwrite');const store=tx.objectStore('documents');const get=store.get('active');get.onsuccess=()=>{const record=get.result;const resume=record.resume??record;resume.experience=Array.from({length:30},(_,i)=>({id:`long-${i}`,title:`Product Design Role ${i+1}`,company:`Company ${i+1}`,location:'New York, NY',start:'2018',end:'2022',current:false,description:'Led discovery, designed accessible product workflows, and partnered with engineering to deliver measurable improvements across a large customer base.',bullets:['Improved task completion and customer satisfaction through iterative research.','Created reusable interaction patterns and documented outcomes for partner teams.'],url:''}));store.put(record.resume?{...record,resume}:resume,'active');};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);});
  });
  await page.reload();
  await expect.poll(()=>page.locator('.page-frame').count(),{timeout:15000}).toBeGreaterThanOrEqual(3);
});
