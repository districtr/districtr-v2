import ZoomToFeature from './ZoomToFeature';
import {useMapStore} from '@/app/store/mapStore';
import {getZoneConnectedComponentBBoxes} from '@/app/utils/api/apiHandlers/getZoneConnectedComponentBBoxes';
import {Blockquote, Flex, IconButton, Spinner, Text, Tooltip} from '@radix-ui/themes';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {useEffect, useState} from 'react';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CrossCircledIcon,
  DashIcon,
  QuestionMarkCircledIcon,
} from '@radix-ui/react-icons';

interface ContiguityDetailProps {
  zone: number;
  contiguity: null | number;
  lastUpdated: number | string | null;
  handleUpdateParent: () => void;
  parentIsLoading: boolean;
}

export default function ContiguityDetail({
  zone,
  contiguity,
  lastUpdated,
  handleUpdateParent,
  parentIsLoading,
}: ContiguityDetailProps) {
  const mapDocument = useMapStore(store => store.mapDocument);
  const zoneLastUpdated = useMapStore(store => store.zonesLastUpdated.get(zone));
  const isOutOfSync = zoneLastUpdated && lastUpdated && zoneLastUpdated > lastUpdated;

  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [showZoom, setShowZoom] = useState(false);

  const {data, error, isLoading, isFetching} = useQuery(
    {
      queryKey: [`ConnectedComponentBboxes-${zone}`, `${mapDocument?.document_id}-${lastUpdated}`],
      queryFn: () => mapDocument && getZoneConnectedComponentBBoxes(mapDocument, zone),
      enabled: !!mapDocument && showZoom,
      staleTime: 0,
      retry: false,
      placeholderData: null,
    },
    queryClient
  );

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
        {isOutOfSync || parentIsLoading ? (
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
        <Flex direction="column" gap="1" justify="start" align="start" py="2">
          <Text color="gray">Zoom to components</Text>
          <ZoomToFeature
            features={data.features}
            selectedIndex={selectedFeature}
            setSelectedIndex={setSelectedFeature}
          />
        </Flex>
      )}
    </div>
  );
}
