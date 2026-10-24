import { test, expect } from '@playwright/test';
import path from 'node:path';
import { RESPONSIVE_VIEWPORTS } from '../app/responsive';

test('key journeys have no document-level horizontal overflow across the responsive matrix', async ({ page }) => {
  test.setTimeout(120_000);
  const routes = ['/', '/start', '/templates', '/import', '/editor'];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      if (route === '/editor') await expect(page.getByRole('heading', { name: 'Build your resume' })).toBeVisible();
      const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(dimensions.content, `${route} at ${viewport.width}px: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport + 1);
    }
  }
});

test('core public and editor surfaces have no critical or serious axe violations', async ({ page }) => {
  test.setTimeout(90_000);
  const surfaces = ['/', '/start', '/templates', '/import', '/editor'];
  const findings: { route: string; id: string; help: string; targets: string[] }[] = [];
  for (const route of surfaces) {
    await page.goto(route);
    if (route === '/editor') await expect(page.getByRole('heading', { name: 'Build your resume' })).toBeVisible();
    await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
    const result = await page.evaluate(async () => {
      const axe = (window as unknown as Window & { axe: { run: (context?: Document, options?: object) => Promise<{ violations: { id: string; impact?: string | null; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
      return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    });
    const serious = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    findings.push(...serious.map(({ id, help, nodes }) => ({ route, id, help, targets: nodes.slice(0, 4).flatMap((node) => node.target) })));
  }
  expect(findings, 'serious/critical axe violations by route').toEqual([]);
});

test('dialogs move focus in, close on Escape, and return focus to their trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/editor');
  const designTrigger = page.getByRole('button', { name: 'Design Lab', exact: true }).first();
  await designTrigger.click();
  await expect(page.getByRole('dialog', { name: 'Design Lab' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(designTrigger).toBeFocused();
});

test('print export contains only paginated resume pages, not editor chrome', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Build your resume' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('.command-center')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.editor')).toBeHidden();
  await expect(page.locator('.preview-toolbar')).toBeHidden();
  await expect(page.locator('.page-frame .resume-header h1')).toBeVisible();
  await expect(page.locator('.measurement-root')).toBeHidden();
  await expect(page.locator('.page-frame').first()).toHaveCSS('filter', 'none');
  const contactSeparator = await page.locator('.contact-line span+span').first().evaluate(element => getComputedStyle(element, '::before').content);
  expect(contactSeparator).toContain('|');

  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.toString('latin1')).not.toContain('/Subtype /Image');
  expect(pdf.toString('latin1')).toContain('/Font');
  expect(await page.locator('.page-frame').count()).toBeGreaterThan(0);
});

test('profile and project edits update the preview while its independent scroll stays put',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/editor?resumeId=preview-sync-audit');
  const canvas=page.locator('.canvas-scroll');
  await page.locator('.section-open').filter({hasText:'Profile'}).click();
  const summary=page.locator('.section-card.is-active [contenteditable="true"]');
  await summary.fill('Live profile synchronization check.');
  const profile=page.locator('.page-frame .resume-section').filter({has:page.getByRole('heading',{name:'Profile'})});
  await expect(profile).toContainText('Live profile synchronization check.');
  await canvas.evaluate(el=>{el.scrollTop=Math.max(0,Math.min(260,el.scrollHeight-el.clientHeight));});
  const before=await canvas.evaluate(el=>el.scrollTop);
  await summary.press('End');
  await summary.type(' A further edit.');
  await expect(profile).toContainText('A further edit.');
  const after=await canvas.evaluate(el=>el.scrollTop);
  expect(Math.abs(after-before)).toBeLessThanOrEqual(2);
  await page.locator('.section-open').filter({hasText:'Projects'}).click();
  await page.getByLabel('Project name').fill('Instant preview project');
  await expect(page.locator('.page-frame [data-entry-id="proj-1"]')).toContainText('Instant preview project');
});
