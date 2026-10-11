import { test, expect } from '@playwright/test';

test('basic page load test', async ({ page }) => {
  // Set test environment variables
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10000 });

  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
});
