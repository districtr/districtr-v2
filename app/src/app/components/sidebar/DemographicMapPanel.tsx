'use client';
import {OVERLAY_OPACITY} from '@/app/constants/layers';
import {AllTabularColumns} from '@/app/utils/api/summaryStats';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyVariables} from '@/app/store/demography/constants';
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
import {LegendLabel, LegendLinear, LegendThreshold} from '@visx/legend';
import React from 'react';
import {demographyCache} from '@/app/utils/demography/demographyCache';
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
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const isOverlay = demographicMapMode === 'overlay';

  const variable = useDemographyStore(state => state.variable);
  const variant = useDemographyStore(state => state.variant);
  const setVariable = useDemographyStore(state => state.setVariable);
  const setVariant = useDemographyStore(state => state.setVariant);

  const scale = useDemographyStore(state => state.scale);
  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const availableVariables = demographyVariables.filter(f =>
    demographyCache.availableColumns.includes(f.value)
  );
  const config = availableVariables.find(f => f.value === variable);
  const canBePercent = config?.variants?.includes('percent');
  const labelFormat = canBePercent && variant === 'percent' ? 'percent' : 'compact'
  const colors = scale?.range() || [];

  const handleChangeVariable = (
    newVariable: AllTabularColumns[number],
  ) => {
    setVariable(newVariable);
  };

  const handleChangePercent = (usePercent: boolean) => {
    setVariant(usePercent ? 'percent' : 'raw');
  };

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
            value={variable}
            onValueChange={handleChangeVariable}
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
          {canBePercent && (
            <Text as="label" size="2">
              <Flex gap="2" align="center" justify={'center'}>
                <Text as="label" size="1">
                  Count
                </Text>
                <Switch
                  checked={variant === 'percent'}
                  onCheckedChange={handleChangePercent}
                />
                <Text as="label" size="1">
                  %
                </Text>
              </Flex>
            </Text>
          )}
        </Flex>
      </Flex>
      {(scale && 'invertExtent' in scale) ? (
        <Flex direction={'row'} justify="center" gapX="2">
          <LegendThreshold
            scale={scale}
            labelFormat={label =>
              formatNumber(label as number, labelFormat)
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
                          backgroundColor: colors[i] as string,
                          opacity: isOverlay ? OVERLAY_OPACITY : 0.9,
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
                          labelFormat
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
      ) : scale && config?.fixedScale && config.customLegendLabels ? (
        <Flex direction={'column'} justify="center" gapX="2" width="100%">
          <LinearGradient colors={config.fixedScale.domain().map(d => config.fixedScale!(d))} 
            numTicks={config.customLegendLabels.length}
            />
            <Flex direction={'row'} width="100%" justify="between">
              {config.customLegendLabels.map((label, i) => (
                <Text key={`legend-label-${i}`}>{label}</Text>
              ))}
            </Flex>
        </Flex>
      ) : null}
      {demographicMapMode === 'side-by-side' && (
        <Text size="2" align="center">
          Gray = zero population
        </Text>
      )}
    </Flex>
  );
};

const LinearGradient: React.FC<{
  colors: string[];
  numTicks: number;
}> = ({colors, numTicks}) => {
  return (
    <Box width="100%" height="1rem" position="relative" px="2">

    <Box width="100%" height="100%" position="absolute" top="0" left="0"
      style={{
        background: `linear-gradient(to right, ${colors.join(',')})`,
      }}
      />
      <Flex direction="row" width="100%" height="100%" position="absolute" top="0" left="0" justify="between">
        {Array.from({length: numTicks}).map((_, i) => (
          <Box key={`legend-bar-${i}`} height="100%" className="border-r border-black"
          />
        ))}
      </Flex>
    </Box>
  )
}