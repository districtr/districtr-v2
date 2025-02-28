'use client';
import {
  AllDemographyVariables,
  DemographyVariable,
  demographyVariables,
} from '@/app/store/demographicMap';
import {useDemographyStore} from '@/app/store/demographicMap';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import {formatNumber} from '@/app/utils/numbers';
import {Box, Button, Flex, Switch, Tabs, Text} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendQuantile, LegendItem, LegendLabel, LegendLinear} from '@visx/legend';
import {useEffect} from 'react';

const mapOptions: Array<{label: string; value: MapStore['mapOptions']['showDemographicMap']}> = [
  {
    label: 'No Demographic Map',
    value: undefined,
  },
  {
    label: 'Side by Side Map',
    value: 'side-by-side',
  },
  {
    label: 'Overlay Map',
    value: 'overlay',
  },
];
export const DemographicMapPanel: React.FC = () => {
  const variable = useDemographyStore(state => state.variable);
  const displayVariable = variable.replace('_percent', '');
  const config = demographyVariables.find(f => f.value === displayVariable);
  const setVariable = useDemographyStore(state => state.setVariable);
  const demographicMapMode = useMapStore(state => state.mapOptions.showDemographicMap);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const scale = useDemographyStore(state => state.scale);

  const handleChange = (_newVariable?: DemographyVariable, _usePercent?: boolean) => {
    const usePercent = _usePercent ?? variable.includes('percent');
    const newVariable = _newVariable ?? config?.value;
    if (!newVariable) return;
    const hasPctVariable = !newVariable?.includes('total');
    const newVariableName: AllDemographyVariables =
      usePercent && hasPctVariable ? `${newVariable}_percent` : newVariable;
    setVariable(newVariableName);
  };
  useEffect(() => {
    setVariable('total_pop');
  }, []);

  return (
    <Flex direction="column">
      <Tabs.Root
        value={demographicMapMode}
        onValueChange={value =>
          setMapOptions({showDemographicMap: value as MapStore['mapOptions']['showDemographicMap']})
        }
      >
        <Tabs.List>
          {mapOptions.map((option, i) => (
            <Tabs.Trigger key={i} value={option.value as string}>
              {option.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <Flex direction="row" gapX="3" align="center" py="2">
        <Text>Map Variable</Text>
        <Select.Root
          value={displayVariable}
          onValueChange={value => {
            handleChange(value as DemographyVariable);
          }}
        >
          <Select.Trigger />
          <Select.Content>
            {demographyVariables.map(f => (
              <Select.Item key={f.value} value={f.value}>
                {f.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Text as="label" size="2">
          <Flex gap="2">
            <Switch
              checked={variable.includes('percent')}
              onCheckedChange={value => {
                handleChange(undefined, value);
              }}
            />
            Show Percent
          </Flex>
        </Text>
      </Flex>
      {!!scale && (
        <LegendQuantile
          scale={scale as any}
          labelFormat={label =>
            formatNumber(label as number, variable.includes('percent') ? 'percent' : 'compact')
          }
          className="w-full"
        >
          {labels => (
            <Flex direction={'row'} width="100%">
              {labels.map((label, i) => (
                <Flex direction="column" key={`legend-${i}`} justify="between" width={`${100 / labels.length}%`}>
                  {/* <LegendItem
                  key={`legend-${i}`}
                  onClick={() => {
                    // if (events) alert(`clicked: ${JSON.stringify(label)}`);
                  }}
                  className="flex flex-col"
                > */}
                  <Box
                    width={'100%'}
                    style={{
                      display: 'inline-block',
                      height: '1rem',
                      backgroundColor: label.value,
                    }}
                  ></Box>
                  <LegendLabel align="center" style={{transform: 'translateX(calc(100% - 10px))'}}>
                    {i < labels.length -1 ? label.text.split('-')[1] : ''}
                  </LegendLabel>
                  {/* </LegendItem> */}
                </Flex>
              ))}
            </Flex>
          )}
        </LegendQuantile>
      )}
      {/* {!!scale && <LegendLinear 
        scale={scale} 
        labelFormat={label => formatNumber(label as number, variable.includes('percent') ? 'percent' : 'compact')}>
        {labels => labels.map((label, i) => (
          <LegendItem key={`legend-${i}`} margin="0 4px">
            <svg width={10} height={10}>
              <rect fill={label.value} width={10} height={10} />
            </svg>
            <LegendLabel align="left" margin="0 4px">
              {label.text}
            </LegendLabel>
          </LegendItem>
        ))}
        </LegendLinear>} */}
      <Text size="2" align="center">
        Gray = zero population
      </Text>
    </Flex>
  );
};
