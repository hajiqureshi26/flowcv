import { test, expect } from '@playwright/test';

const envelope = (result: unknown) => ({
  result,
  provider: { name: 'gemini', model: 'gemini-2.5-flash', fallback_used: false, cached: false },
});

test('a reviewed tailoring suggestion updates the resume locally after acceptance', async ({ page }) => {
  await page.route('**/api/ai/tailor', (route) => route.fulfill({
    json: envelope({
      suggestions: [{
        id: 'e2e-suggestion-1',
        section: 'experience',
        entry_id: 'exp-1',
        original_content: 'Lead product design for the core platform, from early discovery through launch.',
        suggested_content: 'Led core platform design from discovery through launch.',
        reason: 'Uses active, concise language.',
        supporting_requirement: 'Platform leadership',
      }],
    }),
  }));

  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI studio' }).click();
  await expect(page.getByRole('dialog', { name: 'AI studio' })).toBeVisible();
  await page.getByRole('tab', { name: 'Tailoring' }).click();
  await page.getByLabel('Job description').fill('We value platform leadership.');
  await page.getByRole('button', { name: 'Suggest tailoring changes' }).click();

  await expect(page.getByTestId('tailoring-suggestions')).toContainText('Job requirement: Platform leadership');
  await page.getByRole('button', { name: 'Accept suggestion 1' }).click();
  await expect(page.getByText('Tailoring suggestion accepted and saved on this device.')).toBeVisible();

  await page.getByRole('button', { name: 'Close AI studio' }).click();
  await expect(page.locator('.page-frame .paper').first()).toContainText('Led core platform design from discovery through launch.');

  // IndexedDB persistence: the accepted change is restored after a reload.
  await page.reload();
  await expect(page.locator('.page-frame .paper').first()).toContainText('Led core platform design from discovery through launch.');
});

test('a rejected suggestion never reaches the resume', async ({ page }) => {
  await page.route('**/api/ai/tailor', (route) => route.fulfill({
    json: envelope({
      suggestions: [{
        id: 'e2e-suggestion-2',
        section: 'experience',
        entry_id: 'exp-1',
        original_content: 'Lead product design for the core platform, from early discovery through launch.',
        suggested_content: 'Owned a platform that grew revenue threefold.',
        reason: 'Adds scale.',
        supporting_requirement: 'Platform leadership',
      }],
    }),
  }));

  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI studio' }).click();
  await page.getByRole('tab', { name: 'Tailoring' }).click();
  await page.getByLabel('Job description').fill('We value platform leadership.');
  await page.getByRole('button', { name: 'Suggest tailoring changes' }).click();
  await page.getByRole('button', { name: 'Reject suggestion 1' }).click();
  await expect(page.getByText('Suggestion rejected. Your resume was not changed.')).toBeVisible();

  await page.getByRole('button', { name: 'Close AI studio' }).click();
  await expect(page.locator('.page-frame .paper').first()).toContainText('Lead product design for the core platform');
  await page.reload();
  await expect(page.locator('.page-frame .paper').first()).not.toContainText('Owned a platform that grew revenue threefold.');
});

test('AI studio tabs are keyboard navigable and its drawer fits narrow screens', async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/editor');
    await page.getByRole('button', { name: 'AI studio' }).click();
    const assistantTab = page.getByRole('tab', { name: 'Resume assistant' });
    await assistantTab.focus();
    await page.keyboard.press('ArrowRight');
    const jdTab = page.getByRole('tab', { name: 'Job description' });
    await expect(jdTab).toBeFocused();
    await expect(jdTab).toHaveAttribute('aria-selected', 'true');
    const dialog = page.getByRole('dialog', { name: 'AI studio' });
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('rate limited AI requests surface the Retry-After countdown', async ({ page }) => {
  await page.route('**/api/ai/**', (route) => route.fulfill({
    status: 429,
    // Mirrors the backend CORS configuration, which exposes Retry-After so the
    // browser can read the rate-limit delay.
    headers: { 'Retry-After': '42', 'Access-Control-Expose-Headers': 'Retry-After' },
    json: { error: { code: 'rate_limited', message: 'AI request limit reached. Try again after the indicated delay.' } },
  }));

  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI studio' }).click();
  await page.getByRole('button', { name: 'Review suggestion' }).click();

  await expect(page.getByTestId('ai-error')).toContainText('Rate limited');
  await expect(page.getByTestId('ai-retry-after')).toContainText('Try again in 42 seconds.');
  await expect(page.getByRole('button', { name: 'Review suggestion' })).toBeDisabled();
});

test('Job Mode analyzes, matches, and reviews before applying a supported change', async ({ page }) => {
  await page.route('**/api/ai/jd/analyze', route => route.fulfill({ json: envelope({ job_title: 'Product Designer', required_skills: ['Design systems'], preferred_skills: [], technologies: ['Figma'], responsibilities: ['Lead design'], experience_requirements: [], education_requirements: [], keywords: ['design systems'], ats_keywords: [] }) }));
  await page.route('**/api/ai/ats/analyze', route => route.fulfill({ json: envelope({ matching_skills: ['Figma'], weak_evidence: [], missing_relevant_keywords: [], content_issues: [], formatting_concerns: [], experience_alignment: ['Relevant product design work'], education_alignment: [], actionable_suggestions: [] }) }));
  await page.route('**/api/ai/tailor', route => route.fulfill({ json: envelope({ suggestions: [
    { id: 'reject-first', section: 'experience', entry_id: 'exp-1', original_content: 'Lead product design for the core platform, from early discovery through launch.', suggested_content: 'Owned a design organization of 40 people.', reason: 'Claims leadership.', supporting_requirement: 'Lead design' },
    { id: 'accept-second', section: 'experience', entry_id: 'exp-1', original_content: 'Lead product design for the core platform, from early discovery through launch.', suggested_content: 'Led product design for the core platform from discovery through launch.', reason: 'Makes the existing responsibility concise.', supporting_requirement: 'Lead design' },
  ] }) }));

  await page.goto('/editor');
  await page.getByRole('button', { name: 'AI studio' }).click();
  await page.getByRole('tab', { name: 'Job mode' }).click();
  await page.getByLabel('Job description').fill('Product Designer. Lead design systems work with Figma.');
  await page.getByRole('button', { name: 'Analyze job description' }).click();
  await expect(page.getByTestId('job-mode').getByText('Design systems', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Match resume' }).click();
  await expect(page.getByText('Relevant product design work')).toBeVisible();
  await page.getByRole('button', { name: 'Prepare suggestions' }).click();
  await expect(page.getByTestId('tailoring-suggestions')).toBeVisible();
  await page.getByRole('button', { name: 'Reject suggestion 1' }).click();
  await expect(page.getByText('Suggestion rejected. Your resume was not changed.')).toBeVisible();
  await expect(page.locator('.page-frame .paper').first()).not.toContainText('Owned a design organization of 40 people.');
  await page.getByRole('button', { name: 'Accept suggestion 2' }).click();
  await expect(page.getByText('Tailoring suggestion accepted and saved on this device.')).toBeVisible();
  await page.getByRole('button', { name: 'Close AI studio' }).click();
  await expect(page.locator('.page-frame .paper').first()).toContainText('Led product design for the core platform from discovery through launch.');
});
