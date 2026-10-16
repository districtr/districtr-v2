export const DRAFT_STATUSES = {
  SCRATCH: 'scratch',
  IN_PROGRESS: 'in_progress',
  READY_TO_SHARE: 'ready_to_share',
} as const;

export type DraftStatus = (typeof DRAFT_STATUSES)[keyof typeof DRAFT_STATUSES];

export const DRAFT_STATUS_TEXT: Record<DraftStatus, string> = {
  [DRAFT_STATUSES.SCRATCH]: 'Scratch Work',
  [DRAFT_STATUSES.IN_PROGRESS]: 'In Progress',
  [DRAFT_STATUSES.READY_TO_SHARE]: 'Ready to Share',
};

export const DRAFT_STATUS_ORDER: DraftStatus[] = [
  DRAFT_STATUSES.SCRATCH,
  DRAFT_STATUSES.IN_PROGRESS,
  DRAFT_STATUSES.READY_TO_SHARE,
];

export const DRAFT_STATUS_COLORS: Record<DraftStatus, 'gray' | 'orange' | 'green'> = {
  [DRAFT_STATUSES.SCRATCH]: 'gray',
  [DRAFT_STATUSES.IN_PROGRESS]: 'orange',
  [DRAFT_STATUSES.READY_TO_SHARE]: 'green',
};
