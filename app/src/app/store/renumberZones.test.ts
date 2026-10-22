import {describe, expect, test} from 'bun:test';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';
import {followZoneRenumber} from './temporalStore';

describe('renumberZones', () => {
  test('swaps zones, metadata follows, undo restores both', () => {
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
    useAssignmentsStore.getState().renumberZones(
      new Map([
        [1, 2],
        [2, 1],
      ])
    );
    const swapped = () => ({
      zones: Array.from(useAssignmentsStore.getState().zoneAssignments.values()),
      colors: useMapStore.getState().mapDocument?.color_scheme,
      aliases: useMapStore.getState().mapDocument?.map_metadata.zone_aliases,
      comments: useMapStore.getState().mapDocument?.document_comments?.map(c => c.zone),
      selected: useMapControlsStore.getState().selectedZone,
      locks: useMapControlsStore.getState().mapOptions.lockPaintedAreas,
    });
    expect(swapped()).toEqual({
      zones: [2, 1, 3],
      colors: ['#222', '#111', '#333'],
      aliases: {'2': 'North'},
      comments: [1],
      selected: 2,
      locks: [1],
    });

    const {undo, redo} = useAssignmentsStore.temporal.getState();
    followZoneRenumber(undo, 'undo');
    expect(swapped()).toEqual({
      zones: [1, 2, 3],
      colors: ['#111', '#222', '#333'],
      aliases: {'1': 'North'},
      comments: [2],
      selected: 1,
      locks: [2],
    });
    followZoneRenumber(redo, 'redo');
    expect(swapped().aliases).toEqual({'2': 'North'});
    expect(swapped().zones).toEqual([2, 1, 3]);
  });
});
