import {CDN_URL, ENVIRONMENT} from './constants';

/** CDN URL for a document's thumbnail, matching the environment-scoped S3 key
 * the backend writes (`thumbnails/{ENVIRONMENT}/{publicId}.png`). */
export const thumbnailUrl = (publicId: number | string): string =>
  `${CDN_URL}/thumbnails/${ENVIRONMENT}/${publicId}.png`;
