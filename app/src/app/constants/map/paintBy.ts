import type {PaintBy} from '@/app/store/types';

const OVERLAY_PREFIX = 'overlay:';

export const paintByOverlay = (overlayId: string): PaintBy => `${OVERLAY_PREFIX}${overlayId}`;

/** The overlay_id a `Paint by` value paints areas of, if any. */
export const overlayIdOf = (paintBy: PaintBy | undefined) =>
  paintBy?.startsWith(OVERLAY_PREFIX) ? paintBy.slice(OVERLAY_PREFIX.length) : null;
