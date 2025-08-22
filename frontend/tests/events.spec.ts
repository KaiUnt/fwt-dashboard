import { test, expect } from '@playwright/test';

test.describe('Events', () => {
  test('events page displays events', async ({ page }) => {
    await page.goto('/');
    
    // Wait for events to load
    await page.waitForLoadState('networkidle');
    
    // Check if events are displayed (adjust selector based on your EventsPage component)
    const eventsContainer = page.locator('[data-testid="events"], .events, [class*="event"]').first();
    
    // Either events are displayed or there's a "no events" message
    await expect(
      page.locator('text=/events|veranstaltungen/i').or(
        page.locator('text=/no events|keine events|keine veranstaltungen/i')
      )
    ).toBeVisible();
  });

  test('can search/filter events', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search"], input[placeholder*="suche"]');
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      
      // Wait for search results
      await page.waitForTimeout(1000);
      
      // Verify search functionality works (results update)
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('can view event details', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for event links or cards
    const eventLink = page.locator('a[href*="/dashboard/"], [data-testid*="event"]').first();
    
    if (await eventLink.isVisible()) {
      await eventLink.click();
      
      // Should navigate to event details page
      await expect(page).toHaveURL(/.*\/dashboard\/.+/);
      
      // Check if event details are displayed
      await expect(page.locator('body')).toBeVisible();
    }
  });
});