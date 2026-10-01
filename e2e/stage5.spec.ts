import { test, expect } from '@playwright/test';

test('Design Lab presets, command palette, editor shortcuts, and local save work together', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'Design Lab', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Design Lab' })).toBeVisible();
  await page.getByRole('button', { name: 'ATS Clean' }).click();
  await expect(page.locator('.page-frame .paper').first()).toHaveClass(/template-ats/);
  await expect(page.locator('.page-frame .paper').first()).toContainText('Alex Morgan');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'What would you like to do?' })).toBeVisible();
  await page.getByRole('button', { name: /Open Design Lab/ }).click();
  await expect(page.getByRole('heading', { name: 'Design Lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.keyboard.press('Control+j');
  await expect(page.getByRole('heading', { name: 'AI studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Close AI studio' }).click();

  await page.keyboard.press('Control+s');
  await expect(page.getByRole('status').filter({ hasText: 'Resume saved on this device.' })).toBeVisible();
});
