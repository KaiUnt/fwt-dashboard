import { FullConfig } from '@playwright/test';
import { cleanTestData } from './test-data';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global test teardown...');
  
  try {
    // Clean up test data
    await cleanTestData();
    
    console.log('✅ Global test teardown completed');
  } catch (error) {
    console.log('⚠️  Global teardown encountered issues:', error);
  }
}

export default globalTeardown;