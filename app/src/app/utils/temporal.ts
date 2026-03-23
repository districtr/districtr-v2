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
    return mapMode === 'coi'
      ? useCoiAssignmentsStore.temporal
      : useAssignmentsStore.temporal;
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
   * Purges all references to a zone from past and future undo/redo states.
   * For COI mode: removes the zone key from communityAssignments and communityVisibility.
   * For district mode: nullifies any geoid assigned to the zone in zoneAssignments.
   *
   * @param mapMode - The active map mode.
   * @param zone - The zone/community ID to purge.
   */
  // TODO: integrate for district maps when supporting variable district counts
  public purgeZone(mapMode: MapControlsStore['mapMode'], zone: Zone) {
    const store = this.getTemporalStore(mapMode);
    const {pastStates, futureStates} = store.getState();

    const purge = (state: Record<string, any>): Record<string, any> => {
      const result = {...state};
      if (mapMode === 'coi') {
        if (result.communityAssignments) {
          result.communityAssignments = new Map(result.communityAssignments);
          result.communityAssignments.delete(zone);
        }
        if (result.communityVisibility) {
          result.communityVisibility = new Map(result.communityVisibility);
          result.communityVisibility.delete(zone);
        }
      } else {
        if (result.zoneAssignments) {
          const patched = new Map(result.zoneAssignments);
          for (const [geoid, assigned] of patched) {
            if (assigned === zone) {
              patched.set(geoid, null);
            }
          }
          result.zoneAssignments = patched;
        }
      }
      return result;
    };

    store.setState({
      pastStates: pastStates.map(purge),
      futureStates: futureStates.map(purge),
    });
  }
}

export const temporalManager = new TemporalManager();
