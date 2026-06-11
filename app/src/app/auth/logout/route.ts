import {signOut} from '@/auth';

/**
 * Preserves the pre-Auth.js URL contract: the app signs users out by
 * navigating to GET /auth/logout.
 */
export async function GET() {
  await signOut({redirectTo: '/'});
}
