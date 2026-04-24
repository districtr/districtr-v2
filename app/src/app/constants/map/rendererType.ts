export const RENDERER_TYPES = {
  MAIN: 'main',
  DEMOGRAPHIC: 'demographic',
} as const;

export type RendererType = (typeof RENDERER_TYPES)[keyof typeof RENDERER_TYPES];
