import {useAssignmentsStore} from './assignmentsStore';

// Convert zundo to a React hook
// from https://github.com/charkour/zundo?tab=readme-ov-file#for-reactive-changes-to-member-properties-of-the-temporal-object-optionally-convert-to-a-react-store-hook

export const useTemporalStore = () => {
  const {futureStates, pastStates, redo, undo} = useAssignmentsStore.temporal.getState();
  const __updateTrigger = useAssignmentsStore(state => state.clientLastUpdated);
  return {
    futureStates,
    pastStates,
    redo,
    undo,
  }
}