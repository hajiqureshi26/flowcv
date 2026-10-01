import { test, expect } from '@playwright/test';

/**
 * Cross-stack check: the browser talks to the real FastAPI service and the real
 * Redis rate limiter. It is opt-in because it needs the Docker stack running:
 *
 *   cd backend
 *   docker compose up -d
 *   $env:LIVE_BACKEND='1'; npx playwright test e2e/ai-live.spec.ts
 *
 * No AI provider key is required: rate limiting and structured provider errors
 * happen before any provider response is used.
 */
test.skip(process.env.LIVE_BACKEND !== '1', 'Requires docker compose up (FastAPI + Redis) with this origin allowed by CORS.');

test('the browser reports a structured provider outage and then a Redis-backed rate limit', async ({ page }) => {
  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI studio' }).click();
  await expect(page.getByLabel('Text sent for review')).not.toHaveValue('');

  const submit = page.getByRole('button', { name: 'Review suggestion' });
  let rateLimited = false;

  for (let attempt = 0; attempt < 12 && !rateLimited; attempt += 1) {
    if (await submit.isEnabled()) await submit.click();
    await expect(page.getByTestId('ai-error')).toBeVisible();
    rateLimited = await page.getByTestId('ai-retry-after').isVisible();
    if (!rateLimited) await page.waitForTimeout(300);
  }

  await expect(page.getByTestId('ai-error')).toContainText('Rate limited');
  await expect(page.getByTestId('ai-retry-after')).toContainText(/Try again in \d+ seconds?\./);
  await expect(submit).toBeDisabled();
});
