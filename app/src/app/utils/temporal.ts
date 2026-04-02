import {useAssignmentsStore} from '../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../store/coiAssignmentsStore';
import {MapControlsStore} from '../store/mapControlsStore';
import {Zone} from '../constants/types';

/**
 * Manages undo/redo temporal state across different map modes (district vs COI).
 * Delegates to the appropriate Zustand temporal store based on the active map mode.
 */
class TemporalManager {
  /**
   * Returns the temporal (undo/redo) store for the given map mode's assignments store.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  private getTemporalStore(mapMode: MapControlsStore['mapMode']) {
    return mapMode === 'coi' ? useCoiAssignmentsStore.temporal : useAssignmentsStore.temporal;
  }

  /**
   * Pauses undo/redo tracking if currently active.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  public pause(mapMode: MapControlsStore['mapMode']) {
    const state = this.getTemporalStore(mapMode).getState();
    if (state.isTracking) {
      state.pause();
    }
  }

  /**
   * Resumes undo/redo tracking if currently paused.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  public resume(mapMode: MapControlsStore['mapMode']) {
    const state = this.getTemporalStore(mapMode).getState();
    !state.isTracking && state.resume();
  }

  /**
   * Clears all undo/redo history.
   * @param mapMode - The active map mode, determines which assignments store to use.
   */
  public clear(mapMode: MapControlsStore['mapMode']) {
    this.getTemporalStore(mapMode).getState().clear();
  }

  /**
   * Clears all undo/redo history when a zone is permanently removed.
   * This is simpler than trying to surgically remove the zone from each snapshot.
   *
   * @param mapMode - The active map mode.
   * @param _zone - The zone/community ID being removed (reserved for future per-zone purge).
   */
  // TODO: integrate for district maps when supporting variable district counts
  public purgeZone(mapMode: MapControlsStore['mapMode'], _zone: Zone) {
    this.clear(mapMode);
  }
}

export const temporalManager = new TemporalManager();
