import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';
import {useMapStore} from './mapStore';
import {idb} from '../utils/idb/idb';

// Convert zundo to a React hook
// from https://github.com/charkour/zundo?tab=readme-ov-file#for-reactive-changes-to-member-properties-of-the-temporal-object-optionally-convert-to-a-react-store-hook

// After undo/redo, zundo synchronously restores the snapshot into the store but
// does not write to IDB. Without an explicit write the restored assignments are
// lost on refresh: fetchDocument reads IDB, finds clientLastUpdated === updated_at
// (no local edits), and loads the server copy instead of the undone state.
//
// We write with new Date() rather than the snapshot's clientLastUpdated because
// the snapshot timestamp may be older than the server's updated_at (e.g. undo
// after save), which would incorrectly signal "server is newer" to fetchDocument.
// Using a fresh timestamp ensures IDB is always treated as having local edits.
// Note: we do NOT update the store's clientLastUpdated here — that would create
// a spurious zundo snapshot and corrupt the undo history.

const syncIdbAfterUndoRedo = () => {
  const mapDocument = useMapStore.getState().mapDocument;
  if (!mapDocument) return;
  const {zoneAssignments} = useAssignmentsStore.getState();
  idb.updateIdbAssignments(mapDocument, zoneAssignments, new Date().toISOString(), true);
};

const syncCoiIdbAfterUndoRedo = () => {
  const mapDocument = useMapStore.getState().mapDocument;
  if (!mapDocument) return;
  const {communityAssignments} = useCoiAssignmentsStore.getState();
  idb.updateIdbCoiAssignments(mapDocument, communityAssignments, new Date().toISOString(), true);
};

export const useTemporalStore = () => {
  const {futureStates, pastStates, redo, undo} = useAssignmentsStore.temporal.getState();
  void useAssignmentsStore(state => state.clientLastUpdated);
  return {
    futureStates,
    pastStates,
    redo: () => {
      redo();
      syncIdbAfterUndoRedo();
    },
    undo: () => {
      undo();
      syncIdbAfterUndoRedo();
    },
  };
};

export const useCoiTemporalStore = () => {
  const {futureStates, pastStates, redo, undo} = useCoiAssignmentsStore.temporal.getState();
  void useCoiAssignmentsStore(state => state.clientLastUpdated);
  return {
    futureStates,
    pastStates,
    redo: () => {
      redo();
      syncCoiIdbAfterUndoRedo();
    },
    undo: () => {
      undo();
      syncCoiIdbAfterUndoRedo();
    },
  };
};
