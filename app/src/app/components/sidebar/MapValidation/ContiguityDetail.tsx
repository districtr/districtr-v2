import ZoomToFeature from './ZoomToFeature';
import {useMapStore} from '@/app/store/mapStore';
import {getZoneConnectedComponentBBoxes} from '@/app/utils/api/apiHandlers/getZoneConnectedComponentBBoxes';
import {Blockquote, Flex, IconButton, Spinner, Text, Tooltip} from '@radix-ui/themes';
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
  }),
    [data, contiguity];

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
 * Every connected component is a zoom target, labelled with its size when the
 * payload carries one (components arrive sorted largest first). Older payloads
 * without sizes fall back to 1-based numbering.
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
        return `Component · ${n} area${n === 1 ? '' : 's'}`;
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
        padding={200}
      />
    </Flex>
  );
}
