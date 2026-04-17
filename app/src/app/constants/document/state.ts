export const APP_LOADING_STATES = {
  LOADED: 'loaded',
  INITIALIZING: 'initializing',
  LOADING: 'loading',
  BLURRED: 'blurred',
} as const;

export type AppLoadingState = (typeof APP_LOADING_STATES)[keyof typeof APP_LOADING_STATES];

export const ACCESS_STATES = {
  READ: 'read',
  EDIT: 'edit',
} as const;

export type AccessState = (typeof ACCESS_STATES)[keyof typeof ACCESS_STATES];
