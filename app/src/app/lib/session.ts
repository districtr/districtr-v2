/**
 * Session type for authenticated API requests.
 * Compatible with the API factory's Bearer token resolution.
 */
export type AppSession = {
  tokenSet: {
    accessToken: string;
  };
};
