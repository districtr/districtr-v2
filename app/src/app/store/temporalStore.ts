import {useAssignmentsStore} from './assignmentsStore';
import {useCoiAssignmentsStore} from './coiAssignmentsStore';

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
  };
};

export const useCoiTemporalStore = () => {
  const {futureStates, pastStates, redo, undo} = useCoiAssignmentsStore.temporal.getState();
  const __updateTrigger = useCoiAssignmentsStore(state => state.clientLastUpdated);
  return {
    futureStates,
    pastStates,
    redo,
    undo,
  };
};
