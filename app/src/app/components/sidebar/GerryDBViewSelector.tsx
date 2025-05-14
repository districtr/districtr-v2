import React from 'react';
import {Flex, Select, Text} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';

export const GerryDBViewSelector: React.FC<{
  onChange: (map: DistrictrMap) => void;
  value?: DistrictrMap;
}> = ({onChange, value}) => {
  const mapViews = useMapStore(state => state.mapViews);
  const {isPending, isError, data, error} = mapViews || {};
  if (isPending) return <div>Loading geographies... 🌎</div>;
  if (isError) return <div>Error loading geographies: {error?.message}</div>;

  return (
    <Select.Root
      onValueChange={name => {
        const value = data?.find(view => view.name === name);
        if (value) {
          onChange(value);
        }
      }}
      value={value?.name}
    >
      <Select.Trigger placeholder="Select a geography">
        <Flex align="center">
          <Text>Map: {value?.name}</Text>
        </Flex>
      </Select.Trigger>
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
};
