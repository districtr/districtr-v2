import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {MIN_DIFF_MS} from '../constants/configuration';
import {ZundoOptions} from 'zundo';
import {AssignmentsStore, AssignmentsTemporalSnapshot} from './assignmentsStore';

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

const cloneTemporalSnapshot = (
  snapshot: AssignmentsTemporalSnapshot
): AssignmentsTemporalSnapshot => ({
  shatterIds: {
    parents: new Set(snapshot.shatterIds.parents),
    children: new Set(snapshot.shatterIds.children),
  },
  parentToChild: new Map(
    Array.from(snapshot.parentToChild.entries()).map(([parentId, children]) => [
      parentId,
      new Set(children),
    ])
  ),
  childToParent: new Map(snapshot.childToParent),
  zoneAssignments: new Map(snapshot.zoneAssignments),
  clientLastUpdated: snapshot.clientLastUpdated,
});

// Shared diff function for all temporal stores — only fires when clientLastUpdated changes
// and enough time has passed since the last snapshot.
export const temporalDiff = (past: Partial<AssignmentsStore>, curr: Partial<AssignmentsStore>) => {
  // If diff returns null, no state is stored
  if (!past.clientLastUpdated || !curr.clientLastUpdated) return null;
  // If the client timestamp is the same, don't store
  if (past.clientLastUpdated === curr.clientLastUpdated) return null;
  // If not yet ingested, don't store
  if (past.clientLastUpdated === '' || curr.clientLastUpdated === '') return null;
  // If the difference is less than the minimum diff time, don't store
  if (
    new Date(curr.clientLastUpdated).getTime() - new Date(past.clientLastUpdated).getTime() <
    MIN_DIFF_MS
  )
    return null;

  if (past.pendingShatterUndoState && !curr.pendingShatterUndoState) {
    return cloneTemporalSnapshot(past.pendingShatterUndoState);
  }
  return past;
};

export const temporalConfig: ZundoOptions<any, AssignmentsStore> = {
  // If diff returns null, not state is stored
  diff: temporalDiff,
  limit: 20,
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
