import ZoomToFeature from './ZoomToFeature';
import {useMapStore} from '@/app/store/mapStore';
import {getZoneConnectedComponentBBoxes} from '@/app/utils/api/apiHandlers';
import {Blockquote, Flex, IconButton, Spinner, Text, Tooltip} from '@radix-ui/themes';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {useState} from 'react';
import {ChevronDownIcon, ChevronUpIcon, CrossCircledIcon} from '@radix-ui/react-icons';

interface ZoomToConnectedComponentsProps {
  zone: number;
  contiguity: number;
  updateTrigger: number | string | null;
}

export default function ZoomToConnectedComponents({
  zone,
  contiguity,
  updateTrigger,
}: ZoomToConnectedComponentsProps) {
  const mapDocument = useMapStore(store => store.mapDocument);
  const [selectedFeature, setSelectedFeature] = useState<number | null>(null);
  const [showZoom, setShowZoom] = useState(false);

  const {data, error, isLoading} = useQuery(
    {
      queryKey: [`ConnectedComponentBboxes-${zone}`, `${mapDocument?.document_id}-${updateTrigger}`],
      queryFn: () => mapDocument && getZoneConnectedComponentBBoxes(mapDocument, zone),
      enabled: !!mapDocument && showZoom,
      staleTime: 0,
      retry: false,
      placeholderData: null,
    },
    queryClient
  );

  return (
    <div>
      <Flex direction="row" gap="1" justify="start" align="center">
        <CrossCircledIcon color="red" />
        <Text color="gray">{data?.features?.length ?? contiguity} connected components</Text>
        <Tooltip content="View connected components">
          <IconButton variant="ghost" onClick={() => setShowZoom(prev => !prev)}>
            {showZoom ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </IconButton>
        </Tooltip>
      </Flex>
      {showZoom && !data && !error && <Spinner />}
      {showZoom && error && (
        <Blockquote color="red">Error fetching connected components</Blockquote>
      )}
      {!!(showZoom && !isLoading && data) && (
        <Flex direction="column" gap="1" justify="start" align="start" py="2">
          <Text color="gray">Zoom to connected components</Text>
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
