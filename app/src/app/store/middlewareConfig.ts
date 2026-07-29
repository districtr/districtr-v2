import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {ZundoOptions} from 'zundo';
import {AssignmentsStore} from './assignmentsStore';
import {CoiAssignmentsStore} from './coiAssignmentsStore';
import {TEMPORAL_HISTORY_LIMIT} from '@constants/document/temporal';
import {cloneTemporalSnapshot} from '../utils/temporalSnapshot';

const prodWrapper: typeof devtools = (store: any) => store;
export const devwrapper = process.env.NODE_ENV === 'development' ? devtools : prodWrapper;

export const persistOptions: PersistOptions<MapStore, Partial<MapStore>> = {
  name: 'districtr-persist-v2',
  version: 0,
  partialize: state => ({
    userID: state.userID,
  }),
};

export const devToolsConfig: DevtoolsOptions = {
  serialize: {
    options: {
      set: (setInStore: Set<unknown>) => Array.from(setInStore),
      map: (mapInStore: Map<string, unknown>) => {
        return Array.from(mapInStore.entries()).reduce(
          (acc, [key, value]) => {
            acc[key] = value; // Convert Map to plain object
            return acc;
          },
          {} as Record<string, unknown>
        );
      },
    },
  },
};

// Shared diff function for all temporal stores — fires once per real edit (every set that
// bumps clientLastUpdated AND replaces a tracked collection). Generic over the store type so
// the same function can drive both district and COI zundo configurations.
//
// Every mutation path replaces tracked Maps/Sets wholesale, so reference equality across all
// partialized keys is a reliable O(keys) "did anything actually change" check. Timestamp-only
// bumps (comment/metadata edits, save syncs) keep identical refs and are skipped — otherwise
// they'd create dead undo steps that appear to do nothing.
interface TemporalDiffSnapshot {
  clientLastUpdated?: string;
  pendingShatterUndoState?: AssignmentsStore['pendingShatterUndoState'];
}

export const temporalDiff = <T extends TemporalDiffSnapshot>(
  past: Partial<T>,
  curr: Partial<T>
) => {
  // If diff returns null, no state is stored
  if (!past.clientLastUpdated || !curr.clientLastUpdated) return null;
  // If the client timestamp is the same, don't store
  if (past.clientLastUpdated === curr.clientLastUpdated) return null;
  // Timestamp-only bump: no tracked collection was replaced, so nothing to undo
  const contentChanged = (Object.keys(past) as Array<keyof T>).some(
    key => key !== 'clientLastUpdated' && past[key] !== curr[key]
  );
  if (!contentChanged) return null;
  if (past.pendingShatterUndoState && !curr.pendingShatterUndoState) {
    // pendingShatterUndoState: null so restoring this entry can't leave a stale
    // pending snapshot in the store (entries are applied as partial merges).
    return {
      ...cloneTemporalSnapshot(past.pendingShatterUndoState),
      pendingShatterUndoState: null,
    } as unknown as Partial<T>;
  }
  return past;
};

export const assignmentsTemporalConfig: ZundoOptions<any, AssignmentsStore> = {
  // If diff returns null, not state is stored
  diff: temporalDiff,
  limit: TEMPORAL_HISTORY_LIMIT,
  // @ts-ignore: save only partial store
  partialize: state => {
    const {
      shatterIds,
      parentToChild,
      zoneAssignments,
      clientLastUpdated,
      childToParent,
      pendingShatterUndoState,
    } = state;
    return {
      shatterIds,
      parentToChild,
      childToParent,
      zoneAssignments,
      clientLastUpdated,
      pendingShatterUndoState,
    } as Partial<AssignmentsStore>;
  },
};

export const coiAssignmentsTemporalConfig: ZundoOptions<any, CoiAssignmentsStore> = {
  diff: temporalDiff,
  limit: TEMPORAL_HISTORY_LIMIT,
  // @ts-ignore: save only partial store
  partialize: state => {
    const {
      shatterIds,
      parentToChild,
      childToParent,
      communityAssignments,
      communityVisibility,
      clientLastUpdated,
    } = state;
    return {
      shatterIds,
      parentToChild,
      childToParent,
      communityAssignments,
      communityVisibility,
      clientLastUpdated,
    };
  },
};
