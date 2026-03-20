import {useAssignmentsStore} from '../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../store/coiAssignmentsStore';
import {MapControlsStore} from '../store/mapControlsStore';

/**
 * Manages undo/redo temporal state across different map modes (district vs COI).
 * Delegates to the appropriate Zustand temporal store based on the active map mode.
 */
class TemporalManager {
  /**
   * Returns the temporal (undo/redo) state for the given map mode's assignments store.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  private getTemporalState(mapMode: MapControlsStore['mapMode']) {
    return mapMode === 'coi'
      ? useCoiAssignmentsStore.temporal.getState()
      : useAssignmentsStore.temporal.getState();
  }

  /**
   * Pauses undo/redo tracking if currently active.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  public pause(mapMode: MapControlsStore['mapMode']) {
    const temporalState = this.getTemporalState(mapMode);
    temporalState.isTracking && temporalState.pause();
  }

  /**
   * Resumes undo/redo tracking if currently paused.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  public resume(mapMode: MapControlsStore['mapMode']) {
    const temporalState = this.getTemporalState(mapMode);
    !temporalState.isTracking && temporalState.resume();
  }

  /**
   * Clears all undo/redo history.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  public clear(mapMode: MapControlsStore['mapMode']) {
    this.getTemporalState(mapMode).clear();
  }
}

export const temporalManager = new TemporalManager();
