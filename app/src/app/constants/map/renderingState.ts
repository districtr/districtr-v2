export const RENDERING_STATES = {
  LOADED: 'loaded',
  INITIALIZING: 'initializing',
  LOADING: 'loading',
} as const;

export type RenderingState = (typeof RENDERING_STATES)[keyof typeof RENDERING_STATES];
