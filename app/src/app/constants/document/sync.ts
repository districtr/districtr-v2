/** Cadence of the periodic auto-save while editing. */
export const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000;
/** Pause since the last edit required before a periodic auto-save fires. */
export const AUTOSAVE_IDLE_MS = 45 * 1000;

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
