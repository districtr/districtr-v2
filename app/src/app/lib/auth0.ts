import {Auth0Client} from '@auth0/nextjs-auth0/server';
import type {SessionData} from '@auth0/nextjs-auth0/types';

export type Session = SessionData;

export type ClientSession = {
  user?: Session['user'];
  tokenSet?: Session['tokenSet'];
};

// Define scopes based on user roles
const SCOPES = {
  default: 'openid profile email',
  reviewer: 'openid profile email review:content read:read-all',
  editor: 'openid profile email read:content update:content create:content delete:content',
  admin:
    'openid profile email read:content read:read-all update:content update:update-all update:publish create:content delete:content delete:delete-all review:content',
};

// Helper to determine user role from claims
const getUserRole = (user?: Session['user']): 'admin' | 'editor' | 'default' => {
  if (!user) return 'default';

  // Check for admin role in user metadata
  if (user.roles?.includes('Admin')) return 'admin';

  // Check for editor role
  if (user.roles?.includes('Editor')) return 'editor';

  return 'default';
};

export const auth0 = new Auth0Client({
  secret: process.env.AUTH0_SECRET,
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: SCOPES.admin, // Default to admin scope, will be refined during session validation
  },
});

// Function to get scopes for a specific user
export const getScopesForUser = (user?: Session['user']): string => {
  const role = getUserRole(user);
  return SCOPES[role];
};
