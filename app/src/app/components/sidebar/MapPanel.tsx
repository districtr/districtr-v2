'use client';
import {AllTabularColumns, SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {MapControlsStore, useMapControlsStore} from '@/app/store/mapControlsStore';
import {formatNumber} from '@/app/utils/numbers';
import {
  GearIcon,
  InfoCircledIcon,
  MinusIcon,
  PlusIcon,
  ShadowInnerIcon,
  ViewVerticalIcon,
} from '@radix-ui/react-icons';
import {
  Blockquote,
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  IconButton,
  Popover,
  Slider,
  Switch,
  Tabs,
  Text,
  Tooltip,
} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendLabel, LegendThreshold} from '@visx/legend';
import React, {useEffect, useState} from 'react';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {summaryStatLabels} from '@/app/store/demography/evaluationConfig';
import {OVERLAY_OPACITY} from '@/app/constants/layers';

type MapPanelProps = {
  columnGroup: keyof typeof choroplethMapVariables;
  displayedColumnSets: Array<keyof SummaryStatConfig>;
};

const mapDisplayModes: Array<{
  label: string;
  value: MapControlsStore['mapOptions']['showDemographicMap'];
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

const getOpacityStates = (
  mapOptions: MapControlsStore['mapOptions'],
  setMapOptions: MapControlsStore['setMapOptions']
) => [
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

export const MapPanel: React.FC<MapPanelProps> = ({columnGroup}) => {
  const mapMode = useMapControlsStore(state => state.mapOptions.showDemographicMap);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const isOverlay = mapMode === 'overlay';

  const variable = useDemographyStore(state => state.variable);
  const variant = useDemographyStore(state => state.variant);
  const setVariable = useDemographyStore(state => state.setVariable);
  const setVariant = useDemographyStore(state => state.setVariant);

  const scale = useDemographyStore(state => state.scale);
  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const availableMapVariables = useDemographyStore(state => state.availableColumnSets.map);
  const currentVariableList = availableMapVariables[columnGroup] ?? [];
  const mapVariableConfig = availableMapVariables[columnGroup]?.find(f => f.value === variable);

  const handleSetMapMode = (
    newMode: MapControlsStore['mapOptions']['showDemographicMap']
  ) => {
    setMapOptions({showDemographicMap: newMode});
    if (!mapVariableConfig) {
      setVariable(availableMapVariables[columnGroup][0].value);
    }
  };

  const canBePercent = mapVariableConfig?.variants?.includes('percent');
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
      const {mapOptions, setMapOptions} = useMapControlsStore.getState();
      const isOverlayMode = mapOptions.showDemographicMap === 'overlay';
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (
        !isOverlayMode ||
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      )
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
    if (mapVariableConfig) {
      document.addEventListener('keydown', handleKeyPress);
    } else {
      document.removeEventListener('keydown', handleKeyPress);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [mapVariableConfig]);

  if (!Object.keys(availableMapVariables).length) {
    return (
      <Blockquote color="crimson">
        <Text>Demographic data are not available for this map. </Text>
      </Blockquote>
    );
  }
  return (
    <Flex direction="column">
      <Flex direction="row" gap="3" align="center" className="rounded-md" wrap="wrap">
        <Text>Display mode</Text>
        {mapDisplayModes.map((option, i) => (
          <Button
            key={i}
            variant={mapMode === option.value ? 'solid' : 'outline'}
            onClick={() => handleSetMapMode(option.value)}
          >
            {!!option.icon && option.icon}
            {option.label}
          </Button>
        ))}
      </Flex>
      {mapMode !== undefined && (
        <>
          <Flex direction="column" pt="2">
            <Flex direction="row" gap="3" align="start" py="2" wrap="wrap">
              <Flex direction="row" gap="3" align="center" wrap="wrap">
                <Text>Map variable</Text>
                <Select.Root value={variable} onValueChange={handleChangeVariable}>
                  <Select.Trigger>
                    <Text>{mapVariableConfig?.label ?? 'Select a variable'}</Text>
                  </Select.Trigger>
                  <Select.Content>
                    {currentVariableList.map(f => (
                      <Select.Item key={f.value} value={f.value}>
                        {f.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>

                {!!mapVariableConfig && (
                  <Popover.Root>
                    <Popover.Trigger>
                      <GearIcon />
                    </Popover.Trigger>
                    <Popover.Content>
                      <Flex direction={'column'} gapY="2">
                        <Heading as="h3" size="3">
                          Choropleth Map Settings
                        </Heading>
                        <Flex direction="row" gapX="3" align="center">
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
                        <Text
                          as="label"
                          className={`${canBePercent ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                        >
                          <Flex gap="2" align="center">
                            <Checkbox
                              checked={canBePercent && variant === 'percent'}
                              disabled={!canBePercent}
                              onCheckedChange={handleChangePercent}
                            />
                            Show data as percent
                          </Flex>
                        </Text>
                        {isOverlay && (
                          <Flex direction="column" gapY="2">
                            <Text>Overlay Opacity</Text>
                            <Slider
                              value={[mapOptions.overlayOpacity]}
                              onValueChange={value => setMapOptions({overlayOpacity: value[0]})}
                              min={0}
                              max={1}
                              step={0.01}
                            />
                          </Flex>
                        )}

                        {mapMode === 'overlay' && (
                          <Flex direction="column" gapY="1">
                            <Flex direction="row" gapX="1" align="center">
                              <Text>Overlay mode</Text>
                              <Tooltip content="Press 'x' to cycle through the overlay modes.">
                                <IconButton variant="ghost">
                                  <InfoCircledIcon />
                                </IconButton>
                              </Tooltip>
                            </Flex>
                            <Flex direction="row" gapX="0" align="center" wrap="wrap">
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
                          </Flex>
                        )}
                      </Flex>
                    </Popover.Content>
                  </Popover.Root>
                )}
              </Flex>
            </Flex>
          </Flex>

          {!!mapVariableConfig && scale && 'invertExtent' in scale ? (
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
            </Flex>
          ) : !!mapVariableConfig &&
            scale &&
            mapVariableConfig?.fixedScale &&
            mapVariableConfig.customLegendLabels ? (
            <Flex direction={'column'} justify="center" gapX="2" width="100%">
              <LinearGradient
                colors={mapVariableConfig.fixedScale
                  .domain()
                  .map(d => mapVariableConfig.fixedScale!(d))}
                numTicks={mapVariableConfig.customLegendLabels.length}
              />
              <Flex direction={'row'} width="100%" justify="between">
                {mapVariableConfig.customLegendLabels.map((label, i) => (
                  <Text key={`legend-label-${i}`}>{label}</Text>
                ))}
              </Flex>
            </Flex>
          ) : null}
          {!!mapVariableConfig && mapMode === 'side-by-side' && (
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
