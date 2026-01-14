import { FullConfig } from '@playwright/test';

/**
 * Global Setup for Playwright E2E Tests
 * 
 * This runs once before all tests to verify the environment is ready.
 * Only runs for local environments (when BASE_URL includes 'localhost').
 * 
 * When running inside Docker (IS_DOCKER=true), uses internal network URLs:
 * - Frontend: http://frontend:3000
 * - Backend: http://backend:8000
 * 
 * When running from host machine, uses exposed ports:
 * - Frontend: http://localhost:3000
 * - Backend: http://localhost:8000
 */

const FRONTEND_URL = 'http://localhost:3000'
const BACKEND_URL = 'http://localhost:8000';

async function checkService(url: string, name: string, timeout = 30000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        // 404 is okay for the frontend root check
        console.log(`✓ ${name} is reachable at ${url}`);
        return;
      }
    } catch (error) {
      // Service not ready yet, continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(
    `${name} not reachable at ${url} after ${timeout / 1000}s. ` +
    'Make sure docker-compose is running: docker-compose up -d'
  );
}

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('\n🔧 Running E2E test setup...\n');
  console.log(`Target environment: ${FRONTEND_URL}`);
  
  const isLocal = FRONTEND_URL.includes('localhost');
  
  if (!isLocal) {
    console.log('⚠️  Running against remote environment - skipping local service checks');
    
    // Just verify the remote URL is reachable
    try {
      const response = await fetch(FRONTEND_URL);
      if (!response.ok && response.status !== 404) {
        throw new Error(`Remote environment returned status ${response.status}`);
      }
      console.log(`✓ Remote environment is reachable at ${FRONTEND_URL}\n`);
    } catch (error) {
      throw new Error(
        `Remote environment not reachable at ${FRONTEND_URL}. ` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    
    return;
  }
  
  // For local environment, verify docker-compose services
  console.log('Checking docker-compose services...\n');
  
  // Check frontend
  await checkService(FRONTEND_URL, 'Frontend (Next.js)');
  
  // Check backend (root returns {"message":"Hello World"})
  await checkService(BACKEND_URL, 'Backend (FastAPI)');
  
  // Check that the API is functioning
  try {
    const apiResponse = await fetch(`${BACKEND_URL}/api/districtr_maps`);
    if (apiResponse.ok) {
      console.log('✓ Backend API is responding correctly');
    } else {
      console.log(`⚠️  Backend API returned status ${apiResponse.status}`);
    }
  } catch (error) {
    console.log('⚠️  Could not verify backend API - tests may fail');
  }
  
  // Optional: Seed test data
  // This could create a test document that all tests can use
  if (process.env.SEED_TEST_DATA === 'true') {
    console.log('\nSeeding test data...');
    await seedTestData();
  }
  
  console.log('\n✓ Setup complete, ready to run tests\n');
}

/**
 * Optional: Seed test data for consistent test runs
 */
async function seedTestData(): Promise<void> {
  try {
    // Check if we have a test map slug available
    const mapsResponse = await fetch(`${BACKEND_URL}/api/districtr_maps`);
    if (!mapsResponse.ok) {
      console.log('⚠️  Could not fetch available maps for seeding');
      return;
    }
    
    const maps = await mapsResponse.json();
    
    if (maps.length === 0) {
      console.log('⚠️  No maps available for test seeding');
      return;
    }
    
    // Use the first available map for testing
    const testMap = maps[0];
    console.log(`Using map "${testMap.name}" (${testMap.districtr_map_slug}) for tests`);
    
    // Store the map slug for tests to use
    process.env.TEST_MAP_SLUG = testMap.districtr_map_slug;
    
  } catch (error) {
    console.log('⚠️  Error seeding test data:', error);
  }
}

export default globalSetup;
