import {Auth0Client} from '@auth0/nextjs-auth0/server';
import type {SessionData} from '@auth0/nextjs-auth0/types';

export type Session = SessionData;

export type ClientSession = {
  user?: Session['user'];
  tokenSet?: Session['tokenSet'];
};

export const auth0 = new Auth0Client({
  secret: process.env.AUTH0_SECRET,
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email create:content read:content update:content delete:content', // TODO Inherit scopes from user role
  },
});
