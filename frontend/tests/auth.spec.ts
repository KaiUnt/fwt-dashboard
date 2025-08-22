import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    
    // Check if login form is visible
    await expect(page.locator('form')).toBeVisible();
  });

  test('can navigate to login page', async ({ page }) => {
    await page.goto('/');
    
    // Look for login link or button (adjust selector based on your UI)
    const loginLink = page.getByRole('link', { name: /login|anmelden/i });
    if (await loginLink.isVisible()) {
      await loginLink.click();
      await expect(page).toHaveURL(/.*login/);
    }
  });
});