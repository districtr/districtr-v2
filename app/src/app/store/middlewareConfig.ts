import {devtools, DevtoolsOptions, PersistOptions} from 'zustand/middleware';
import {MapStore} from './mapStore';
import {ZundoOptions} from 'zundo';
import {AssignmentsStore, AssignmentsTemporalSnapshot} from './assignmentsStore';

type AssignmentsTemporalStoreSlice = Partial<AssignmentsStore>;

const prodWrapper = ((store: unknown, _options?: unknown) => store) as typeof devtools;
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

const MIN_DIFF_MS = 3000;

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

export const temporalConfig: ZundoOptions<AssignmentsStore, AssignmentsTemporalStoreSlice> = {
  // If diff returns null, not state is stored
  diff: (past, curr) => {
    if (!past.clientLastUpdated || !curr.clientLastUpdated) return null;
    // if the client timestamp is the same, don't store
    if (past.clientLastUpdated === curr.clientLastUpdated) return null;
    // If not yet ingested, don't store
    if (past.clientLastUpdated === '' || curr.clientLastUpdated === '') return null;
    if (past.pendingShatterUndoState && !curr.pendingShatterUndoState) {
      return cloneTemporalSnapshot(past.pendingShatterUndoState);
    }
    // If the difference is less than the minimum diff time, don't store
    if (
      new Date(curr.clientLastUpdated.toString()).getTime() -
        new Date(past.clientLastUpdated.toString()).getTime() <
      MIN_DIFF_MS
    )
      return null;
    return past;
  },
  limit: 20,
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
    };
  },
};
