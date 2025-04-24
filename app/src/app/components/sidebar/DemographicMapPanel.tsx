'use client';
import {AllTabularColumns} from '@/app/utils/api/summaryStats';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
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
  Blockquote,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Popover,
  Switch,
  Tabs,
  Text,
} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendLabel, LegendThreshold} from '@visx/legend';
import React, {useEffect, useState} from 'react';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {summaryStatLabels} from '@/app/store/demography/evaluationConfig';
import {OVERLAY_OPACITY} from '@/app/constants/layers';

const mapDisplayModes: Array<{
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

const getOpacityStates = (mapOptions: MapStore['mapOptions'], setMapOptions: MapStore['setMapOptions']) => [
    {
      selected: mapOptions.showPaintedDistricts && mapOptions.overlayOpacity > 0,
      label: 'Overlay',
      onClick: () => setMapOptions({showPaintedDistricts: true, overlayOpacity: OVERLAY_OPACITY}),
    },
    {
      selected: !mapOptions.showPaintedDistricts,
      label: 'Show Thematic Map',
      onClick: () => setMapOptions({showPaintedDistricts: false, overlayOpacity: 1}),
    },
    {
      selected: mapOptions.showPaintedDistricts && mapOptions.overlayOpacity === 0,
      label: 'Show Districts',
      onClick: () => setMapOptions({showPaintedDistricts: true, overlayOpacity: 0}),
    },
  ];
export const DemographicMapPanel: React.FC = () => {
  const demographicMapMode = useMapStore(state => state.mapOptions.showDemographicMap);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const mapOptions = useMapStore(state => state.mapOptions);
  const isOverlay = demographicMapMode === 'overlay';

  const variable = useDemographyStore(state => state.variable);
  const variant = useDemographyStore(state => state.variant);
  const setVariable = useDemographyStore(state => state.setVariable);
  const setVariant = useDemographyStore(state => state.setVariant);

  const scale = useDemographyStore(state => state.scale);
  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const availableMapVariables = useDemographyStore(state => state.availableColumnSets.map);
  const [columnGroup, setColumnGroup] = useState<keyof typeof choroplethMapVariables>('TOTPOP');
  const currentVariableList = availableMapVariables[columnGroup] ?? [];
  const config = availableMapVariables[columnGroup]?.find(f => f.value === variable);

  useEffect(() => {
    if (!Object.keys(availableMapVariables).length) {
      return;
    }
    if (!availableMapVariables[columnGroup]) {
      const firstKey = Object.keys(availableMapVariables)[0] as keyof typeof choroplethMapVariables;
      setColumnGroup(firstKey);
      setVariable(availableMapVariables[firstKey][0].value);
    } else {
      setVariable(availableMapVariables[columnGroup][0].value);
    }
  }, [availableMapVariables, columnGroup]);

  const canBePercent = config?.variants?.includes('percent');
  const labelFormat = canBePercent && variant === 'percent' ? 'percent' : 'compact';
  const colors = scale?.range() || [];

  const handleChangeVariable = (newVariable: AllTabularColumns[number]) => {
    setVariable(newVariable);
  };

  const handleChangePercent = (usePercent: boolean) => {
    setVariant(usePercent ? 'percent' : 'raw');
  };


  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const {mapOptions, setMapOptions} = useMapStore.getState();
      const isOverlayMode = mapOptions.showDemographicMap === 'overlay';
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (!isOverlayMode || activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if command/control held down, don't do anything
      if (event.metaKey || event.ctrlKey) return;
      // if key is digit, set selected zone to that digit
      let value = event.key;
      // if x, set showDemographicMap to undefined
      const opacityStates = getOpacityStates(mapOptions, setMapOptions);
      if (value === 'x') {
        const currentState = opacityStates.findIndex(f => f.selected);
        const nextState = (currentState + 1) % opacityStates.length;
        opacityStates[nextState].onClick();
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (!Object.keys(availableMapVariables).length) {
    return (
      <Blockquote color="crimson">
        <Text>Demographic data are not available for this map. </Text>
      </Blockquote>
    );
  }
  return (
    <Flex direction="column">
      <Flex direction="row" gapX="3" align="center" className=" rounded-md">
        {mapDisplayModes.map((option, i) => (
          <Button
            key={i}
            variant={demographicMapMode === option.value ? 'solid' : 'outline'}
            onClick={() => setMapOptions({showDemographicMap: option.value})}
          >
            {!!option.icon && option.icon}
            {option.label}
          </Button>
        ))}
      </Flex>
      {demographicMapMode !== undefined && (
        <>
          <Flex direction="column" pt="2">
            <Text>Map Variable</Text>
            <Tabs.Root
              value={columnGroup}
              onValueChange={value => setColumnGroup(value as keyof typeof choroplethMapVariables)}
            >
              <Tabs.List>
                {summaryStatLabels.map(f => (
                  <Tabs.Trigger key={f.value} value={f.value}>
                    <Heading as="h3" size="3">
                      {f.label}
                    </Heading>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs.Root>
            <Flex direction="row" gapX="3" align="center" py="2">
              <Select.Root value={variable} onValueChange={handleChangeVariable}>
                <Select.Trigger />
                <Select.Content>
                  {currentVariableList.map(f => (
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
                    <Switch checked={variant === 'percent'} onCheckedChange={handleChangePercent} />
                    <Text as="label" size="1">
                      %
                    </Text>
                  </Flex>
                </Text>
              )}
            </Flex>
          </Flex>

          {demographicMapMode === 'overlay' && (
            <Flex direction="row" gapX="0" align="center" py="2">
              {getOpacityStates(mapOptions, setMapOptions).map((option, i) => (
                <Button
                  key={i}
                  className="!rounded-none mr-[-2px]"
                  variant={option.selected ? 'solid' : 'outline'}
                  onClick={option.onClick}
                >
                  {option.label}
                </Button>
              ))}
            </Flex>
          )}
          {scale && 'invertExtent' in scale ? (
            <Flex direction={'row'} justify="center" gapX="2">
              <LegendThreshold
                scale={scale}
                labelFormat={label => formatNumber(label as number, labelFormat)}
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
                              opacity: isOverlay ? mapOptions.overlayOpacity : 0.9,
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
                            {formatNumber(label.datum as number, labelFormat)}
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
              <LinearGradient
                colors={config.fixedScale.domain().map(d => config.fixedScale!(d))}
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
        </>
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
      <Box
        width="100%"
        height="100%"
        position="absolute"
        top="0"
        left="0"
        style={{
          background: `linear-gradient(to right, ${colors.join(',')})`,
        }}
      />
      <Flex
        direction="row"
        width="100%"
        height="100%"
        position="absolute"
        top="0"
        left="0"
        justify="between"
      >
        {Array.from({length: numTicks}).map((_, i) => (
          <Box key={`legend-bar-${i}`} height="100%" className="border-r border-black" />
        ))}
      </Flex>
    </Box>
  );
};
