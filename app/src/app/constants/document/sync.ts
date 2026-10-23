import {DocumentObject} from '@utils/api/apiHandlers/types';

/** Auto-save fires once the user has been idle (no input or map move) this long. */
export const AUTOSAVE_DEBOUNCE_MS = 30 * 1000;
/** ...but no later than this after the first unsaved edit, even if they never stop. */
export const AUTOSAVE_MAX_WAIT_MS = 3 * 60 * 1000;

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
  onNavigate?: (document: DocumentObject) => void;
  onComplete?: () => void;
  context?: ConflictContext;
};

export type ConflictContext = (typeof ConflictContext)[keyof typeof ConflictContext];
