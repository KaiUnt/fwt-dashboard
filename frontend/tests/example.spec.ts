import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/FWT Dashboard/);
});

test('homepage loads', async ({ page }) => {
  await page.goto('/');

  // Check if the page loads successfully
  await expect(page.locator('body')).toBeVisible();
  
  // Wait for any loading states to complete
  await page.waitForLoadState('networkidle');
});