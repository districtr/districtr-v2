import {DraftStatus} from '@/app/utils/api/apiHandlers/types';

export const DRAFT_STATUS = {
  SCRATCH: 'scratch',
  IN_PROGRESS: 'in_progress',
  READY_TO_SHARE: 'ready_to_share',
} as const satisfies Record<string, DraftStatus>;

export const DEFAULT_DRAFT_STATUS: DraftStatus = DRAFT_STATUS.SCRATCH;

export const DRAFT_STATUS_ORDER: DraftStatus[] = [
  DRAFT_STATUS.SCRATCH,
  DRAFT_STATUS.IN_PROGRESS,
  DRAFT_STATUS.READY_TO_SHARE,
];

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  [DRAFT_STATUS.SCRATCH]: 'Scratch Work',
  [DRAFT_STATUS.IN_PROGRESS]: 'In Progress',
  [DRAFT_STATUS.READY_TO_SHARE]: 'Ready to Share',
};

export const DRAFT_STATUS_OG_COLORS: Record<DraftStatus, string> = {
  [DRAFT_STATUS.SCRATCH]: 'orange',
  [DRAFT_STATUS.IN_PROGRESS]: 'blue',
  [DRAFT_STATUS.READY_TO_SHARE]: 'green',
};
