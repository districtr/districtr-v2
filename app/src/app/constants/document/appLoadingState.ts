export const APP_LOADING_STATES = {
  LOADED: 'loaded',
  INITIALIZING: 'initializing',
  LOADING: 'loading',
  BLURRED: 'blurred',
} as const;

export type AppLoadingState = (typeof APP_LOADING_STATES)[keyof typeof APP_LOADING_STATES];
