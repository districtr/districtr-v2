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
import {HealPlan, planHeal} from '@/app/utils/map/healFragments';
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
          <HealFragments zone={zone} outOfSync={!!isOutOfSync} />
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
  const paths = table.array('path');
  const pops = table.array('total_pop_20');
  const pop = new Map<string, number>();
  for (let i = 0; i < paths.length; i++) pop.set(paths[i], pops[i]);
  return (id: string) => pop.get(id);
};

/**
 * "Heal": moves every unit outside the district's main body into the neighboring
 * district it borders most, as one paint (one undo step, autosaved like any edit).
 */
function HealFragments({zone, outOfSync}: {zone: number; outOfSync: boolean}) {
  const mapDocument = useMapStore(store => store.mapDocument);
  const mapLock = useMapStore(store => store.mapLock);
  const [plan, setPlan] = useState<HealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = async () => {
    if (!mapDocument) return;
    setLoading(true);
    setError(null);
    const result = await getZoneConnectedComponents(mapDocument, zone);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.detail);
      return;
    }
    setPlan(
      planHeal(
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
    const timestamp = new Date().toISOString();
    const zonesLastUpdated = new Map(useAssignmentsStore.getState().zonesLastUpdated);
    [zone, ...plan.byTarget.map(t => t.zone)].forEach(z => zonesLastUpdated.set(z, timestamp));
    // Same path as a brush stroke: stage, then ingest once (one undo entry, IDB, autosave).
    useAssignmentsStore.setState({accumulatedAssignments: new Map(plan.moves), zonesLastUpdated});
    useAssignmentsStore.getState().ingestAccumulatedAssignments();
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
          outOfSync
            ? 'Waiting for the contiguity check to catch up with your edits'
            : 'Move every piece outside the main body into the district it borders most'
        }
      >
        <Button
          size="1"
          variant="soft"
          ml="auto"
          loading={loading}
          disabled={outOfSync || !!mapLock}
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
            {!!plan?.skippedStale && (
              <Text size="1" color="gray">
                Skipped {plural(plan.skippedStale)}: changed since the last check, or part of a
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
