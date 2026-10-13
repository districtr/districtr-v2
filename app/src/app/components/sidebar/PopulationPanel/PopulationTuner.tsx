'use client';
import {useEffect, useMemo, useState} from 'react';
import {Button, Flex, IconButton, Text} from '@radix-ui/themes';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@radix-ui/react-icons';
import type {Map as MaplibreMap, MapGeoJSONFeature} from 'maplibre-gl';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
} from '@constants/map/layerIds';
import {buildViewGraph, findTuneOptions, type TuneOption} from '@utils/map/populationTuning';
import {AnimatedCollapse} from '../AnimatedCollapse';
import {signedNumber} from './DistrictMeters';

type ViewScan = ReturnType<typeof buildViewGraph>;

/** Every paintable unit rendered in the viewport, with edge neighbors. */
const scanView = (map: MaplibreMap): ViewScan => {
  const {zoneAssignments, shatterIds} = useAssignmentsStore.getState();
  const layers = [BLOCK_HOVER_LAYER_ID, BLOCK_HOVER_LAYER_ID_CHILD].filter(id => map.getLayer(id));
  // Broken-down parents are painted through their blocks.
  const features = map
    .queryRenderedFeatures({layers})
    .filter(f => !shatterIds.parents.has(f.id?.toString() ?? ''));
  // ~2 screen px: vertices that look shared at this zoom count as shared.
  const zoom = map.getZoom();
  const cell = (360 / (512 * 2 ** zoom)) * 2;
  // Tiles are simplified below z12, the tilesets' unsimplified max zoom
  // (pipelines/tilesets: -z12 -pS).
  return buildViewGraph(features, id => zoneAssignments.get(id) ?? null, cell, zoom >= 12 ? 2 : 1);
};

const Swatch: React.FC<{color: string}> = ({color}) => (
  <span
    className="inline-block w-3 h-3 rounded-sm shrink-0"
    style={{background: color, border: '1px solid var(--gray-7)'}}
  />
);

const TunerBody: React.FC = () => {
  const getMapRef = useMapStore(state => state.getMapRef);
  const childLayer = useMapStore(state => state.mapDocument?.child_layer);
  const captiveIds = useMapStore(state => state.captiveIds);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const locked = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const {populationData} = useZonePopulations();
  const ideal = useSummaryStats().summaryStats?.idealpop;
  const getZoneColor = useZoneColorGetter();
  const [scan, setScan] = useState<ViewScan | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [index, setIndex] = useState(0);

  // Live view: rescan once tiles settle after a move, and after any edit.
  useEffect(() => {
    const map = getMapRef();
    if (!map) return;
    const rescan = () => setScan(scanView(map));
    const rescanWhenIdle = () => map.once('idle', rescan);
    rescan();
    map.on('moveend', rescanWhenIdle);
    const unsubscribe = useAssignmentsStore.subscribe(state => state.zoneAssignments, rescan);
    return () => {
      map.off('moveend', rescanWhenIdle);
      map.off('idle', rescan);
      unsubscribe();
    };
  }, [getMapRef]);

  const deviations = useMemo(
    () =>
      new Map(
        ideal ? populationData.map(d => [d.zone as number, (d.total_pop_20 ?? 0) - ideal]) : []
      ),
    [populationData, ideal]
  );
  const zonesInView = useMemo(
    () =>
      Array.from(new Set(scan?.units.flatMap(u => (u.zone === null ? [] : [u.zone])))).sort(
        (a, b) => a - b
      ),
    [scan]
  );
  // The user's pick sticks; otherwise the brush's district, else the first in view.
  const target =
    picked !== null && zonesInView.includes(picked)
      ? picked
      : zonesInView.includes(selectedZone)
        ? selectedZone
        : (zonesInView[0] ?? null);

  const options = useMemo(() => {
    if (!scan || target === null || locked.includes(target)) return [];
    return findTuneOptions({
      ...scan,
      target,
      deviations,
      canMove: (unit, to) =>
        !locked.includes(to) &&
        !locked.includes(unit.zone) &&
        (!captiveIds.size || captiveIds.has(unit.id)),
    });
  }, [scan, target, deviations, locked, captiveIds]);
  useEffect(() => setIndex(0), [options]);
  const option: TuneOption | undefined = options[Math.min(index, options.length - 1)];

  // Outline each unit in the color of the district it would move to.
  useEffect(() => {
    const map = getMapRef();
    if (!map || !option) return;
    const states = option.moves.map(({unit, to}) => ({
      target: {source: BLOCK_SOURCE_ID, sourceLayer: unit.sourceLayer, id: unit.id},
      color: getZoneColor(to),
    }));
    states.forEach(({target, color}) => map.setFeatureState(target, {tune: color}));
    return () => states.forEach(({target}) => map.removeFeatureState(target, 'tune'));
  }, [option, getMapRef, getZoneColor]);

  const apply = () => {
    const map = getMapRef();
    if (!map || !option) return;
    const {mutateZoneAssignments, ingestAccumulatedAssignments} = useAssignmentsStore.getState();
    const byZone = new Map<number, MapGeoJSONFeature[]>();
    option.moves.forEach(({unit, to}) =>
      byZone.set(to, [
        ...(byZone.get(to) ?? []),
        {
          id: unit.id,
          sourceLayer: unit.sourceLayer,
          properties: {total_pop_20: unit.pop},
        } as unknown as MapGeoJSONFeature,
      ])
    );
    // The click-paint path: buffer every move, ingest once = one undo step.
    byZone.forEach((features, zone) => mutateZoneAssignments(map, features, zone));
    ingestAccumulatedAssignments();
  };

  const step = (by: number) =>
    options.length &&
    setIndex(i => (Math.min(i, options.length - 1) + by + options.length) % options.length);
  const zoneName = (zone: number | null) => (zone === null ? 'Unassigned' : `District ${zone}`);
  const targetDeviation = target === null ? undefined : deviations.get(target);

  if (!scan) return null;
  if (!zonesInView.length || ideal === undefined) {
    return (
      <Text size="2" color="gray">
        Nothing painted in view. Zoom to where districts meet.
      </Text>
    );
  }

  const groups = new Map<string, {from: number | null; to: number; count: number; pop: number}>();
  option?.moves.forEach(({unit, to}) => {
    const key = `${unit.zone}>${to}`;
    const group = groups.get(key) ?? {from: unit.zone, to, count: 0, pop: 0};
    group.count += 1;
    group.pop += unit.pop;
    groups.set(key, group);
  });
  const noun = (count: number) =>
    `${count} ${option?.moves.every(m => m.unit.sourceLayer === childLayer) ? 'block' : 'unit'}${
      count === 1 ? '' : 's'
    }`;
  const isSwap =
    option && option.moves.some(m => m.to === target) && option.moves.some(m => m.to !== target);

  return (
    <Flex
      direction="column"
      gap="3"
      onKeyDown={e => {
        if (e.key === 'ArrowRight') step(1);
        else if (e.key === 'ArrowLeft') step(-1);
        else return;
        e.preventDefault();
      }}
    >
      <Flex direction="column" gap="1">
        <Text size="1" color="gray">
          District to tune (in view)
        </Text>
        <Flex gap="1" wrap="wrap">
          {zonesInView.map(zone => (
            <Button
              key={zone}
              size="1"
              variant={zone === target ? 'solid' : 'surface'}
              color="gray"
              highContrast={zone === target}
              onClick={() => setPicked(zone)}
              aria-pressed={zone === target}
            >
              <Swatch color={getZoneColor(zone)} />
              {zone}
              <span style={{fontVariantNumeric: 'tabular-nums'}}>
                {signedNumber(deviations.get(zone) ?? 0)}
              </span>
            </Button>
          ))}
        </Flex>
      </Flex>

      {target !== null && locked.includes(target) ? (
        <Text size="2" color="gray">
          {zoneName(target)} is locked. Unlock it to tune.
        </Text>
      ) : targetDeviation !== undefined && Math.abs(targetDeviation) < 1 ? (
        <Text size="2" color="gray">
          {zoneName(target)} is at ideal population.
        </Text>
      ) : !option ? (
        <Text size="2" color="gray">
          Nothing in view borders {zoneName(target)} and can move. Pan to where it meets another
          district, or break a precinct into blocks.
        </Text>
      ) : (
        <Flex direction="column" gap="2" className="rounded-lg p-3 bg-[var(--gray-2)]">
          <Flex align="center" justify="between">
            <IconButton
              size="1"
              variant="soft"
              color="gray"
              onClick={() => step(-1)}
              aria-label="Previous option"
            >
              <ChevronLeftIcon />
            </IconButton>
            <Text size="2" weight="bold">
              {isSwap ? 'Swap' : 'Paint'} {noun(option.moves.length)}
              <Text color="gray" weight="regular">
                {' '}
                · {Math.min(index, options.length - 1) + 1} of {options.length}
              </Text>
            </Text>
            <IconButton
              size="1"
              variant="soft"
              color="gray"
              onClick={() => step(1)}
              aria-label="Next option"
            >
              <ChevronRightIcon />
            </IconButton>
          </Flex>
          {Array.from(groups.values()).map(({from, to, count, pop}) => (
            <Flex key={`${from}>${to}`} align="center" gap="1" wrap="wrap">
              <Swatch color={getZoneColor(from, '#ffffff')} />
              <Text size="1">{zoneName(from)}</Text>
              <ArrowRightIcon />
              <Swatch color={getZoneColor(to)} />
              <Text size="1">{zoneName(to)}</Text>
              <Text size="1" color="gray">
                · {noun(count)}, {pop.toLocaleString()} people
              </Text>
            </Flex>
          ))}
          <Flex direction="column" gap="0" style={{fontVariantNumeric: 'tabular-nums'}}>
            {Array.from(option.after).map(([zone, after]) => (
              <Text key={zone} size="1" weight={zone === target ? 'bold' : 'regular'}>
                {zoneName(zone)}: {signedNumber(deviations.get(zone) ?? 0)} → {signedNumber(after)}
              </Text>
            ))}
          </Flex>
          <Flex align="center" justify="between" gap="2">
            <Text size="1" color="gray">
              Outlined in the color of the district each unit moves to. ← → to flip.
            </Text>
            <Button size="1" onClick={apply}>
              Apply
            </Button>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};

/** Super Draw: find the in-view paints/swaps that zero a district's deviation. */
export const PopulationTuner: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <Flex direction="column" mt="3" style={{borderTop: '1px solid var(--gray-4)'}}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full cursor-pointer text-left py-3 rounded transition-colors hover:bg-[var(--gray-2)]"
      >
        <Flex align="center" justify="between">
          <Text size="2" weight="bold">
            Fine-tune population
          </Text>
          <ChevronDownIcon
            className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </Flex>
      </button>
      <AnimatedCollapse open={open}>
        <div className="pb-3">
          <TunerBody />
        </div>
      </AnimatedCollapse>
    </Flex>
  );
};
