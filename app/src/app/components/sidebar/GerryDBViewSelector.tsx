import {useState} from 'react';
import {Flex, Popover, Select, Text, Tooltip} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {document} from '@/app/utils/api/mutations';
import {useTemporalStore} from '@/app/store/temporalStore';

export function GerryDBViewSelector() {
  const [limit, setLimit] = useState<number>(30);
  const [offset, setOffset] = useState<number>(0);
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapViews = useMapStore(state => state.mapViews);
  const clear = useTemporalStore(store => store.clear);
  const {isPending, isError, data, error} = mapViews || {};

  const selectedView = data?.find(
    view => view.districtr_map_slug === mapDocument?.districtr_map_slug
  );

  const handleValueChange = (value: string) => {
    console.log('Value changed: ', value);
    const selectedDistrictrMap = data?.find(view => view.name === value);
    console.log('Selected view: ', selectedDistrictrMap);
    if (
      !selectedDistrictrMap ||
      selectedDistrictrMap.districtr_map_slug === mapDocument?.districtr_map_slug
    ) {
      console.log('No document or same document');
      return;
    }
    console.log('mutating to create new document');
    clear();
    document.mutate({districtr_map_slug: selectedDistrictrMap.districtr_map_slug});
  };

  if (isPending) return <div>Loading geographies... 🌎</div>;

  if (isError) return <div>Error loading geographies: {error?.message}</div>;

  return (
    <Select.Root onValueChange={handleValueChange} value={selectedView?.name}>
      <Tooltip open={!mapDocument?.document_id} content="Start by selecting a geography">
        <Select.Trigger
          placeholder="Select a geography"
          className="mr-1"
          color="blue"
          variant="ghost"
        >
          <Flex align="center">
            <Text>Map: {selectedView?.name}</Text>
          </Flex>
        </Select.Trigger>
      </Tooltip>
      <Select.Content>
        <Select.Group>
          <Select.Label>Districtr map options</Select.Label>
          {data?.map((view, index) => (
            <Select.Item key={index} value={view.name}>
              {view.name}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
