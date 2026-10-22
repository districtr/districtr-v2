import {describe, expect, test} from 'bun:test';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {followZoneRenumber} from './temporalStore';

describe('renumberZones', () => {
  test('renumbers zones, metadata follows, undo restores both', () => {
    useMapStore.setState({
      mapDocument: {
        document_id: '',
        color_scheme: ['#111', '#222', '#333'],
        map_metadata: {zone_aliases: {'1': 'North'}},
        document_comments: [{zone: 2, text: 'south'}],
      } as any,
    });
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]),
      clientLastUpdated: '2020-01-01T00:00:00.000Z',
    });
    useMapControlsStore.setState(s => ({
      selectedZone: 1,
      mapOptions: {...s.mapOptions, lockPaintedAreas: [2]},
    }));
    const {renumberZones} = useAssignmentsStore.getState();
    // A merge isn't a permutation: ignored.
    renumberZones(new Map([[3, 2]]));
    expect(useAssignmentsStore.temporal.getState().pastStates.length).toBe(0);
    // A 3-cycle, so an un-inverted undo would show.
    renumberZones(
      new Map([
        [1, 2],
        [2, 3],
        [3, 1],
      ])
    );
    const state = () => ({
      zones: Array.from(useAssignmentsStore.getState().zoneAssignments.values()),
      colors: useMapStore.getState().mapDocument?.color_scheme,
      aliases: useMapStore.getState().mapDocument?.map_metadata.zone_aliases,
      comments: useMapStore.getState().mapDocument?.document_comments?.map(c => c.zone),
      selected: useMapControlsStore.getState().selectedZone,
      locks: useMapControlsStore.getState().mapOptions.lockPaintedAreas,
    });
    const renumbered = {
      zones: [2, 3, 1],
      colors: ['#333', '#111', '#222'],
      aliases: {'2': 'North'},
      comments: [3],
      selected: 2,
      locks: [3],
    };
    expect(state()).toEqual(renumbered);

    // An ordinary edit after the renumber: undoing it must leave the metadata alone.
    useAssignmentsStore.setState({
      zoneAssignments: new Map([
        ['a', 2],
        ['b', 3],
        ['c', 3],
      ]),
      clientLastUpdated: '2020-01-02T00:00:00.000Z',
    });
    const {undo, redo} = useAssignmentsStore.temporal.getState();
    followZoneRenumber(undo, 'undo');
    expect(state()).toEqual(renumbered);

    followZoneRenumber(undo, 'undo');
    expect(state()).toEqual({
      zones: [1, 2, 3],
      colors: ['#111', '#222', '#333'],
      aliases: {'1': 'North'},
      comments: [2],
      selected: 1,
      locks: [2],
    });
    followZoneRenumber(redo, 'redo');
    expect(state()).toEqual(renumbered);
  });
});
