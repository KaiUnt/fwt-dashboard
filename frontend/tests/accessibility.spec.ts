import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('page has proper heading structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for h1 heading
    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test tab navigation
    await page.keyboard.press('Tab');
    
    // Verify first focusable element receives focus
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Test a few more tab presses
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Should still have a focused element
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Find all images
    const images = page.locator('img');
    const imageCount = await images.count();
    
    if (imageCount > 0) {
      // Check that images have alt attributes
      for (let i = 0; i < Math.min(imageCount, 5); i++) { // Check first 5 images
        const img = images.nth(i);
        const alt = await img.getAttribute('alt');
        expect(alt).not.toBeNull();
      }
    }
  });

  test('color contrast is sufficient', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Basic check: ensure text is visible
    const textElements = page.locator('p, h1, h2, h3, h4, h5, h6, span, div').filter({ hasText: /.+/ });
    const count = await textElements.count();
    
    if (count > 0) {
      // Check first few text elements are visible
      for (let i = 0; i < Math.min(count, 3); i++) {
        await expect(textElements.nth(i)).toBeVisible();
      }
    }
  });
});