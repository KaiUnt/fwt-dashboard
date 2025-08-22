import { chromium, FullConfig } from '@playwright/test';
import { setupTestData } from './test-data';

async function globalSetup(config: FullConfig) {
  console.log('🧪 Starting global test setup...');
  
  try {
    // Wait a bit for services to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Setup test data
    await setupTestData();
    
    console.log('✅ Global test setup completed successfully');
  } catch (error) {
    console.log('⚠️  Global setup encountered issues but continuing:', error);
    // Don't fail the tests if setup has issues - tests should handle missing data gracefully
  }
}

export default globalSetup;