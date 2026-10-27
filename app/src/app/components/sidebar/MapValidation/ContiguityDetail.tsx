import ZoomToFeature from './ZoomToFeature';
import {useMapStore} from '@/app/store/mapStore';
import {getZoneConnectedComponentBBoxes} from '@/app/utils/api/apiHandlers/getZoneConnectedComponentBBoxes';
import {getZoneConnectedComponents} from '@/app/utils/api/apiHandlers/getZoneConnectedComponents';
import {
  AlertDialog,
  Blockquote,
  Button,
  Flex,
  IconButton,
  Spinner,
  Text,
  Tooltip,
} from '@radix-ui/themes';
import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CrossCircledIcon,
  DashIcon,
  QuestionMarkCircledIcon,
} from '@radix-ui/react-icons';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {FragmentMovePlan, planFragmentMoves} from '@/app/utils/map/fragmentMoves';
import {ACCESS_STATES} from '@constants/document/state';

interface ContiguityDetailProps {
  zone: number;
  contiguity: null | number;
  lastUpdated: number | string | null;
  handleUpdateParent: () => void;
}

export default function ContiguityDetail({
  zone,
  contiguity,
  lastUpdated,
  handleUpdateParent,
}: ContiguityDetailProps) {
  const mapDocument = useMapStore(store => store.mapDocument);
  const zoneLastUpdated = useAssignmentsStore(store => store.zonesLastUpdated.get(zone));
  const isOutOfSync = zoneLastUpdated && lastUpdated && zoneLastUpdated > lastUpdated;

  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [showZoom, setShowZoom] = useState(false);

  const {data, error, isLoading, isFetching} = useQuery({
    queryKey: [`ConnectedComponentBboxes-${zone}`, `${mapDocument?.document_id}-${lastUpdated}`],
    queryFn: async () => {
      if (!mapDocument) return null;
      const result = await getZoneConnectedComponentBBoxes(mapDocument, zone);
      if (!result.ok) {
        throw new Error(result.error.detail);
      }
      return result.response;
    },
    enabled: !!mapDocument && showZoom,
    staleTime: 0,
    retry: false,
    placeholderData: null,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    // Handle the case of:
    // Get parent contiguity and contiguity > 1
    // Draw to fix contiguity, but them click show zoom
    if (contiguity && contiguity > 1 && data?.features.length === 1) {
      handleUpdateParent();
    } else if (contiguity === 1) {
      setShowZoom(false);
    }
  }, [data, contiguity]);

  if (contiguity === null) {
    return <DashIcon color="gray" />;
  }

  return (
    <div>
      <Flex direction="row" gap="1" justify="start" align="center">
        {isOutOfSync ? (
          <QuestionMarkCircledIcon color="gray" />
        ) : contiguity === 1 ? (
          <CheckCircledIcon color="green" />
        ) : (
          <CrossCircledIcon color="red" />
        )}
        <Text color="gray" className={`${isOutOfSync ? 'opacity-35' : ''}`}>
          {contiguity} component{contiguity > 1 ? 's' : ''}
        </Text>
        {Boolean(contiguity !== null && contiguity > 1) && (
          <Tooltip content="View components">
            <IconButton variant="ghost" onClick={() => setShowZoom(prev => !prev)}>
              {showZoom ? <ChevronUpIcon /> : <ChevronDownIcon />}
            </IconButton>
          </Tooltip>
        )}
        {contiguity > 1 && mapDocument?.access === ACCESS_STATES.EDIT && (
          <MoveFragments zone={zone} />
        )}
      </Flex>
      {showZoom && !data && !error && <Spinner />}
      {showZoom && error && <Blockquote color="red">Error fetching components</Blockquote>}
      {!!(showZoom && !isLoading && !isFetching && data) && (
        <ComponentZoomList
          features={data.features}
          selectedFeature={selectedFeature}
          setSelectedFeature={setSelectedFeature}
        />
      )}
    </div>
  );
}

/**
 * Every connected component is a zoom target, labelled "Component" with its
 * size when the payload carries one (components arrive sorted largest first).
 * Older payloads without sizes fall back to 1-based numbering.
 */
function ComponentZoomList({
  features,
  selectedFeature,
  setSelectedFeature,
}: {
  features: Array<GeoJSON.Feature<GeoJSON.Polygon> | GeoJSON.Polygon>;
  selectedFeature: number | null;
  setSelectedFeature: (index: number | null) => void;
}) {
  const nGeos = (f: (typeof features)[number]) =>
    'properties' in f ? (f.properties?.n_geos as number | undefined) : undefined;
  const hasSizes = features.length > 0 && features.every(f => nGeos(f) !== undefined);
  const labels = hasSizes
    ? features.map(f => {
        const n = nGeos(f)!;
        return `Component · ${n} unit${n === 1 ? '' : 's'}`;
      })
    : undefined;

  return (
    <Flex direction="column" gap="1" justify="start" align="start" py="2">
      <Text color="gray" size="1">
        Zoom to a component:
      </Text>
      <ZoomToFeature
        features={features}
        selectedIndex={selectedFeature}
        setSelectedIndex={setSelectedFeature}
        labels={labels}
      />
    </Flex>
  );
}

/** Population per unit from the loaded demography table; undefined when it isn't loaded. */
const getPopLookup = () => {
  const table = demographyService.table;
  if (!table?.columnNames().includes('total_pop_20')) return () => undefined;
  const paths = table.array(demographyService.id_col);
  const pops = table.array('total_pop_20');
  const pop = new Map<string, number>();
  for (let i = 0; i < paths.length; i++) pop.set(paths[i], pops[i]);
  return (id: string) => pop.get(id);
};

/**
 * "Heal": moves every unit outside the district's main body into the neighboring
 * district it borders most, as one paint (one undo step, autosaved like any edit).
 */
function MoveFragments({zone}: {zone: number}) {
  const mapDocument = useMapStore(store => store.mapDocument);
  const mapLock = useMapStore(store => store.mapLock);
  // Block view only re-merges the focused parent, and Heal can move units outside it.
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  // Like Paint and Erase: nothing is edited out of sight.
  const districtsHidden = useMapControlsStore(
    state => state.mapOptions.showPaintedDistricts === false
  );
  const [plan, setPlan] = useState<FragmentMovePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = async () => {
    if (!mapDocument) return;
    setLoading(true);
    setError(null);
    // The server plans from the saved map, so save local edits (including undo/redo) first.
    const {clientLastUpdated, handlePutAssignments} = useAssignmentsStore.getState();
    if (clientLastUpdated !== '' && clientLastUpdated !== mapDocument.updated_at) {
      const saved = await handlePutAssignments(false, {silent: true});
      if (!saved.ok) {
        setLoading(false);
        setError(saved.error.detail);
        return;
      }
    }
    const result = await getZoneConnectedComponents(mapDocument, zone);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.detail);
      return;
    }
    setPlan(
      planFragmentMoves(
        zone,
        result.response.components,
        useAssignmentsStore.getState().zoneAssignments,
        useMapControlsStore.getState().mapOptions.lockPaintedAreas,
        getPopLookup()
      )
    );
  };

  const apply = () => {
    if (!plan) return;
    const {setAccumulatedAssignments, ingestAccumulatedAssignments} =
      useAssignmentsStore.getState();
    // Stage, then ingest once, like a brush stroke: one undo entry, IDB, autosave.
    setAccumulatedAssignments(plan.moves, new Set([zone, ...plan.byTarget.map(t => t.zone)]));
    ingestAccumulatedAssignments();
    setPlan(null);
  };

  const moved = plan?.byTarget.reduce(
    (acc, t) => ({units: acc.units + t.units, population: acc.population + t.population}),
    {units: 0, population: 0}
  );
  const plural = (n: number) => `${n.toLocaleString()} unit${n === 1 ? '' : 's'}`;

  return (
    <>
      <Tooltip
        content={
          inBlockView
            ? 'Exit block view to heal'
            : districtsHidden
              ? 'Show painted districts to heal'
              : 'Move every piece outside the main body into the district it borders most'
        }
      >
        <Button
          size="1"
          variant="soft"
          ml="auto"
          loading={loading}
          disabled={inBlockView || districtsHidden || !!mapLock}
          onClick={preview}
        >
          Heal
        </Button>
      </Tooltip>
      {error && (
        <Text color="red" size="1">
          {error}
        </Text>
      )}
      <AlertDialog.Root open={!!plan} onOpenChange={open => !open && setPlan(null)}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Heal district {zone}</AlertDialog.Title>
          <AlertDialog.Description size="2">
            {moved?.units
              ? `Move ${plural(moved.units)} (${moved.population.toLocaleString()} people) out of district ${zone}'s smaller pieces. Its most populous piece stays.`
              : `Nothing can be moved out of district ${zone}.`}
          </AlertDialog.Description>
          <Flex direction="column" gap="1" mt="3">
            {plan?.byTarget.map(t => (
              <Text size="2" key={t.zone}>
                To district {t.zone}: {plural(t.units)}, {t.population.toLocaleString()} people
              </Text>
            ))}
            {!!plan?.skippedLocked && (
              <Text size="1" color="gray">
                Skipped {plural(plan.skippedLocked)}: locked district.
              </Text>
            )}
            {!!plan?.skippedNoNeighbor && (
              <Text size="1" color="gray">
                Skipped {plural(plan.skippedNoNeighbor)}: no neighboring district.
              </Text>
            )}
            {!!plan?.skippedNotOnMap && (
              <Text size="1" color="gray">
                Skipped {plural(plan.skippedNotOnMap)}: changed since the last check, or part of a
                larger unbroken unit.
              </Text>
            )}
          </Flex>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button disabled={!moved?.units} onClick={apply}>
                Move units
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}
