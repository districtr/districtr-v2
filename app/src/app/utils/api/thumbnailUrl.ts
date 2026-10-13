import {CDN_URL, ENVIRONMENT} from './constants';

/** Only production gets its own S3 folder; every other ENVIRONMENT value
 * (local, development, qa, test) collapses into "development" — mirrors the
 * backend's get_thumbnail_environment_folder() in thumbnails/main.py. */
const thumbnailEnvironmentFolder = (): string =>
  ENVIRONMENT === 'production' ? 'production' : 'development';

/** CDN URL for a document's thumbnail, matching the environment-scoped S3 key
 * the backend writes (`thumbnails/{folder}/{publicId}.png`). */
export const thumbnailUrl = (publicId: number | string): string =>
  `${CDN_URL}/thumbnails/${thumbnailEnvironmentFolder()}/${publicId}.png`;
