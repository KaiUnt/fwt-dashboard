import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('can navigate to main sections', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Test navigation to different sections
    const sections = [
      { name: /dashboard/i, path: '/dashboard' },
      { name: /profile|profil/i, path: '/profile' },
      { name: /friends|freunde/i, path: '/friends' },
      { name: /activity|aktivität/i, path: '/activity' }
    ];

    for (const section of sections) {
      const link = page.getByRole('link', { name: section.name });
      if (await link.isVisible()) {
        await link.click();
        await expect(page).toHaveURL(new RegExp(`.*${section.path}`));
        await page.goBack();
        await page.waitForLoadState('networkidle');
      }
    }
  });

  test('responsive navigation works', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Look for mobile menu toggle
    const mobileMenuToggle = page.locator('[aria-label*="menu"], [data-testid*="menu"], button[class*="mobile"]');
    if (await mobileMenuToggle.first().isVisible()) {
      await mobileMenuToggle.first().click();
      
      // Check if navigation menu becomes visible
      const nav = page.locator('nav, [role="navigation"]');
      await expect(nav.first()).toBeVisible();
    }
  });
});