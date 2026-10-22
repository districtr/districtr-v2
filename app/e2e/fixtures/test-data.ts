/**
 * Test Data and Configuration
 *
 * Environment-aware test constants and fixtures.
 * Supports both Docker internal networking and host machine access.
 */

const isDocker = process.env.IS_DOCKER === 'true';
const baseURL =
  process.env.BASE_URL || (isDocker ? 'http://frontend:3000' : 'http://localhost:3000');
const backendURL =
  process.env.BACKEND_URL || (isDocker ? 'http://backend:8000' : 'http://localhost:8000');

/**
 * Determine if we're testing against local or remote environment
 */
export const isLocal = baseURL.includes('localhost') || baseURL.includes('frontend:3000');
export const isPreview = /\/\/(api-)?pr-\d+\./.test(baseURL) || baseURL.includes('preview');
export const isProduction = !isLocal && !isPreview;
export {isDocker};

/**
 * Test configuration that adapts to the environment
 */
export const testConfig = {
  baseURL,
  backendURL,

  // Use local test document or a known preview document
  testDocumentId: isLocal
    ? process.env.TEST_DOCUMENT_ID || 'local-test-doc-id'
    : process.env.TEST_DOCUMENT_ID || 'preview-test-doc',

  // Map slug that exists in the target environment
  testMapSlug: process.env.TEST_MAP_SLUG || 'al_congressional_districts',

  // Skip tests that require write access on production
  canCreateDocuments: isLocal || process.env.ALLOW_WRITES === 'true',

  // Skip visual regression tests on first run
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === 'true',

  // Timeout multiplier for slower environments
  timeoutMultiplier: isLocal ? 1 : 2,
};

/**
 * URLs for common test pages
 */
export const testUrls = {
  home: '/',
  about: '/about',
  guide: '/guide',
  places: '/places',
  contact: '/contact',

  // Map URLs - need valid document IDs
  mapCreate: '/map',
  mapEdit: (documentId: string) => `/map/${documentId}/edit`,
  mapView: (documentId: string) => `/map/${documentId}`,

  // Place pages
  place: (slug: string) => `/place/${slug}`,

  // Admin routes (require auth)
  admin: '/admin',
  adminReview: '/admin/review',
  adminCms: '/admin/cms',
};

/**
 * Test selectors for common UI elements
 */
export const testSelectors = {
  // Map elements
  mapCanvas: '.maplibregl-canvas',
  navigationZoomIn: '.maplibregl-ctrl-zoom-in',
  navigationZoomOut: '.maplibregl-ctrl-zoom-out',

  // Toolbar elements (tool buttons expose aria-pressed)
  toolbar: '[data-testid="toolbar"]',
  brushTool: '[data-testid="brush-tool"]',
  eraserTool: '[data-testid="eraser-tool"]',
  panTool: '[data-testid="pan-tool"]',
  shatterTool: '[data-testid="shatter-tool"]',
  undoTool: '[data-testid="undo-tool"]',

  // Zone picker (Radix radio items: data-state="checked")
  zonePicker: '[data-testid="zone-picker"]',
  zoneButton: (zone: number) => `[data-testid="zone-${zone}"]`,

  sidebar: '[data-testid="sidebar"]',
};

/**
 * Test data for creating new documents
 */
export const testDocumentData = {
  defaultName: 'E2E Test Plan',
  defaultDescription: 'Created by automated E2E tests',

  // Tags that might exist in the test environment
  testTags: ['test', 'automated'],
};

/**
 * Expected values for assertions
 */
export const expectedValues = {
  // Default number of districts (if not specified by map)
  defaultNumDistricts: 10,

  // Default zone colors (first few from color scheme)
  zoneColors: ['#0099cd', '#ffca5d', '#00cd99', '#99cd00', '#cd0099'],

  // Default brush size
  defaultBrushSize: 1,

  // Default active tool
  defaultActiveTool: 'pan',
};

/**
 * Timeout values adjusted for environment
 */
export const testTimeouts = {
  short: 5000 * testConfig.timeoutMultiplier,
  medium: 15000 * testConfig.timeoutMultiplier,
  long: 30000 * testConfig.timeoutMultiplier,
  mapLoad: 45000 * testConfig.timeoutMultiplier,
};

/**
 * Skip conditions for tests
 */
export const skipConditions = {
  // Skip write tests on production
  requiresWriteAccess: () => !testConfig.canCreateDocuments,

  // Skip tests that need specific data
  requiresTestDocument: () =>
    !testConfig.testDocumentId || testConfig.testDocumentId === 'local-test-doc-id',

  // Skip visual tests when snapshots need updating
  visualRegression: () => testConfig.updateSnapshots,
};

/**
 * Helper to generate a unique test ID
 */
export function generateTestId(): string {
  return `e2e-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper to format test description with environment context
 */
export function describeWithEnv(description: string): string {
  const env = isLocal ? 'local' : isPreview ? 'preview' : 'production';
  return `[${env}] ${description}`;
}
