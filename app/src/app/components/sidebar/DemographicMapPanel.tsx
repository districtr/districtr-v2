'use client';
import {
  AllDemographyVariables,
  DemographyVariable,
  demographyVariables,
} from '@/app/store/demographicMap';
import {useDemographyStore} from '@/app/store/demographicMap';
import {MapStore, useMapStore} from '@/app/store/mapStore';
import {formatNumber} from '@/app/utils/numbers';
import {
  GearIcon,
  MinusIcon,
  PlusIcon,
  ShadowInnerIcon,
  ViewVerticalIcon,
} from '@radix-ui/react-icons';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Popover,
  Switch,
  Tabs,
  Text,
  TextField,
} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendQuantile, LegendItem, LegendLabel, LegendLinear} from '@visx/legend';
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
  const variable = useDemographyStore(state => state.variable);
  const displayVariable = variable.replace('_pct', '');
  const config = demographyVariables.find(f => f.value === displayVariable);
  const setVariable = useDemographyStore(state => state.setVariable);
  const demographicMapMode = useMapStore(state => state.mapOptions.showDemographicMap);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const scale = useDemographyStore(state => state.scale);
  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const customBins = useDemographyStore(state => state.customBins);
  const setCustomBins = useDemographyStore(state => state.setCustomBins);
  const [tempBins, setTempBins] = React.useState<number[]>([]);
  const colors = scale?.range();
  const quantiles = customBins.length ? null : scale?.quantiles?.();

  const handleCustomBins = (value: number | string, i: number) => {
    if (!tempBins) return;
    let newCustomBins = [...tempBins];
    // @ts-ignore
    newCustomBins[i] = value;
    setTempBins(newCustomBins);
  };

  const setCustomBinsFromTemp = () => {
    if (!tempBins) return;
    // @ts-ignore
    const cleanBins = tempBins.map(f => parseFloat(f)).sort((a, b) => a - b);
    setCustomBins(cleanBins);
  };

  const handleChange = (_newVariable?: DemographyVariable, _usePercent?: boolean) => {
    const usePercent = _usePercent ?? variable.includes('pct');
    const newVariable = _newVariable ?? config?.value;
    if (!newVariable) return;
    const hasPctVariable = !newVariable?.includes('total');
    // @ts-ignore
    const newVariableName: AllDemographyVariables =
      usePercent && hasPctVariable ? `${newVariable}_pct` : newVariable;
    setVariable(newVariableName);
  };

  useEffect(() => {
    setVariable('total_pop');
  }, []);

  useEffect(() => {
    // @ts-ignore
    setTempBins(customBins?.length ? customBins : quantiles);
  }, [JSON.stringify({customBins, quantiles})]);

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
              checked={variable.includes('pct')}
              onCheckedChange={value => {
                handleChange(undefined, value);
              }}
            />
            Show Percent
          </Flex>
        </Text>
      </Flex>
      {!!scale && (
        <Flex direction={'row'} justify="center" gapX="2">
          <LegendQuantile
            scale={scale as any}
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
                          backgroundColor: label.value,
                        }}
                        key={`legend-bar-${i}`}
                      ></Box>
                    ))}
                  </Flex>

                  <Flex
                    direction="row"
                    width={`${100 - 100 / numberOfbins / 2}%`}
                    style={{paddingLeft: `${100 / numberOfbins / 2}%`}}
                  >
                    {labels.slice(1).map((label, i) => (
                      <LegendLabel align="center" key={`legend-label-text-${i}`}>
                        {formatNumber(
                          // @ts-ignore
                          label.datum,
                          variable.includes('pct') ? 'percent' : 'compact'
                        )}
                      </LegendLabel>
                    ))}
                  </Flex>
                </Flex>
              );
            }}
          </LegendQuantile>
          <Popover.Root>
            <Popover.Trigger>
              <GearIcon />
            </Popover.Trigger>
            <Popover.Content>
              <Flex direction={'column'} gapY="2">
                <Text size="2">Choropleth Map Settings</Text>
                <Flex direction="row" gapX="3">
                  <Text>Number of bins: {numberOfbins}</Text>
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
                {!!tempBins && (
                  <Flex direction={'column'} gapY="2">
                    <Text>Custom bins</Text>
                    <Flex direction={'row'} gapX="2">
                      <Flex direction="column" gapX="2" height={`${numberOfbins * 24}px`}>
                        {[...tempBins, 999].map((q, i) => (
                          <Box
                            className={'size-4'}
                            key={`custom-bin-${i}-block`}
                            flexGrow={'1'}
                            style={{
                              display: 'inline-block',
                              height: '1rem',
                              width: '1rem',
                              // @ts-ignore
                              backgroundColor: colors[i],
                            }}
                          ></Box>
                        ))}
                      </Flex>
                      <Flex
                        direction="column"
                        gapX="2"
                        height={`${numberOfbins * 24 - 12}px`}
                        pt="12px"
                      >
                        {tempBins.map((q, i) => (
                          <TextField.Root
                            key={`custom-bin-${i}`}
                            className="flex-grow"
                            type="number"
                            step=".01"
                            value={Math.round(q * 100) / 100}
                            onChange={e => {
                              handleCustomBins(e.target.value, i);
                            }}
                          />
                        ))}
                      </Flex>
                    </Flex>
                  </Flex>
                )}
                <Button onClick={setCustomBinsFromTemp}>Apply</Button>
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
