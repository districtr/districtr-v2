'use client';
import {
  AllDemographyVariables,
  DemographyVariable,
  demographyVariables,
} from '@/app/store/demographyStore';
import {useDemographyStore} from '@/app/store/demographyStore';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import {formatNumber} from '@/app/utils/numbers';
import {
  GearIcon,
  MinusIcon,
  PlusIcon,
  ShadowInnerIcon,
  ViewVerticalIcon,
} from '@radix-ui/react-icons';
import {Blockquote, Box, Flex, IconButton, Popover, Switch, Tabs, Text} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendLabel, LegendThreshold} from '@visx/legend';
import React, {useEffect} from 'react';

const mapOptions: Array<{
  label: string;
  value: MapStore['mapOptions']['showDemographicMap'];
  icon?: React.ReactNode;
}> = [
  {
    label: 'None',
    value: undefined,
  },
  {
    label: 'Comparison',
    value: 'side-by-side',
    icon: <ViewVerticalIcon />,
  },
  {
    label: 'Overlay',
    value: 'overlay',
    icon: <ShadowInnerIcon />,
  },
];
export const DemographicMapPanel: React.FC = () => {
  const demographicMapMode = useMapStore(state => state.mapOptions.showDemographicMap);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapOptions = useMapStore(state => state.setMapOptions);

  const variable = useDemographyStore(state => state.variable);
  const setVariable = useDemographyStore(state => state.setVariable);

  const scale = useDemographyStore(state => state.scale);
  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const availableVariables = !mapDocument?.available_summary_stats?.length
    ? []
    : demographyVariables.filter(f =>
        f.models.some(m => mapDocument.available_summary_stats.includes(m))
      );
  const displayVariable = variable.replace('_pct', '');
  const config = availableVariables.find(f => f.value === displayVariable);
  const colors = scale?.range() || [];

  const handleChange = (_newVariable?: DemographyVariable, _usePercent?: boolean) => {
    const usePercent = _usePercent ?? variable.includes('pct');
    const newVariable = _newVariable ?? config?.value;
    if (!newVariable) return;
    const hasPctVariable = !newVariable?.includes('total');
    const newVariableName: AllDemographyVariables =
      usePercent && hasPctVariable ? `${newVariable}_pct` : newVariable;
    setVariable(newVariableName);
  };

  useEffect(() => {
    setVariable('total_pop');
  }, []);

  if (!availableVariables.length) {
    return (
      <Blockquote color="crimson">
        <Text>Demographic data are not available for this map. </Text>
      </Blockquote>
    );
  }
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
              <Flex direction="row" gapX="2" align="center">
                {!!option.icon && option.icon}
                {option.label}
              </Flex>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      <Flex direction="column" pt="2">
        <Text>Map Variable</Text>
        <Flex direction="row" gapX="3" align="center" py="2">
          <Select.Root
            value={displayVariable}
            onValueChange={value => {
              handleChange(value as DemographyVariable);
            }}
          >
            <Select.Trigger />
            <Select.Content>
              {availableVariables.map(f => (
                <Select.Item key={f.value} value={f.value}>
                  {f.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          {displayVariable.toLowerCase().indexOf('Total') === -1 && (
            <Text as="label" size="2">
              <Flex gap="2">
                <Switch
                  checked={variable.includes('pct')}
                  onCheckedChange={value => {
                    handleChange(undefined, value);
                  }}
                />
                Show %
              </Flex>
            </Text>
          )}
        </Flex>
      </Flex>
      {!!scale && (
        <Flex direction={'row'} justify="center" gapX="2">
          <LegendThreshold
            scale={scale}
            labelFormat={label =>
              formatNumber(label as number, variable.includes('pct') ? 'percent' : 'compact')
            }
            className="w-full"
          >
            {labels => {
              return (
                <Flex direction={'column'} width="100%">
                  <Flex direction="row" width="100%">
                    {labels.map((label, i) => (
                      <Box
                        width={'100%'}
                        style={{
                          display: 'inline-block',
                          height: '1rem',
                          backgroundColor: colors[i],
                        }}
                        key={`legend-bar-${i}`}
                      ></Box>
                    ))}
                  </Flex>

                  <Flex
                    direction="row"
                    width={`${100 - 100 / colors.length / 2}%`}
                    style={{paddingLeft: `${100 / colors.length / 2}%`}}
                  >
                    {labels.slice(1).map((label, i) => (
                      <LegendLabel align="center" key={`legend-label-text-${i}`}>
                        {formatNumber(
                          label.datum as number,
                          variable.includes('pct') ? 'percent' : 'compact'
                        )}
                      </LegendLabel>
                    ))}
                  </Flex>
                </Flex>
              );
            }}
          </LegendThreshold>
          <Popover.Root>
            <Popover.Trigger>
              <GearIcon />
            </Popover.Trigger>
            <Popover.Content>
              <Flex direction={'column'} gapY="2">
                <Text size="2">Choropleth Map Settings</Text>
                <Flex direction="row" gapX="3">
                  <Text>Max number of bins: {numberOfbins}</Text>
                  <IconButton
                    variant="ghost"
                    onClick={() => setNumberOfBins(numberOfbins - 1)}
                    disabled={numberOfbins < 4}
                  >
                    <MinusIcon />
                  </IconButton>
                  <IconButton
                    variant="ghost"
                    onClick={() => setNumberOfBins(numberOfbins + 1)}
                    disabled={numberOfbins > 8}
                  >
                    <PlusIcon />
                  </IconButton>
                </Flex>
              </Flex>
            </Popover.Content>
          </Popover.Root>
        </Flex>
      )}
      <Text size="2" align="center">
        Gray = zero population
      </Text>
    </Flex>
  );
};
