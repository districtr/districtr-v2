/** Auto-save fires this long after the last edit in a painting session. */
export const AUTOSAVE_DEBOUNCE_MS = 30 * 1000;

export const ConflictContext = {
  Save: 'save',
  Load: 'load',
} as const;

export enum SyncConflictResolution {
  UseLocal = 'use-local',
  UseServer = 'use-server',
  KeepLocal = 'keep-local',
  Fork = 'fork',
}

export type ConflictResolutionOptions = {
  onNavigate?: (documentId: string) => void;
  onComplete?: () => void;
  context?: ConflictContext;
};

export type ConflictContext = (typeof ConflictContext)[keyof typeof ConflictContext];
