'use client';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {MapControlsStore, useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {formatNumber} from '@/app/utils/numbers';
import {GearIcon, MinusIcon, PlusIcon} from '@radix-ui/react-icons';
import {
  Blockquote,
  Box,
  Checkbox,
  Flex,
  Heading,
  IconButton,
  Popover,
  RadioGroup,
  Slider,
  Text,
} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendLabel, LegendThreshold} from '@visx/legend';
import React, {useMemo} from 'react';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {demographyService} from '@/app/utils/demography/demographyService';
import {
  isCoalitionUniverse,
  CoalitionUniverse,
  SUMMARY_TYPES,
  toOverlayGroup,
  type SummaryType,
} from '@constants/demography/summary';
import {COALITION_VARIABLE_BY_UNIVERSE, DemographyVariable} from '@constants/demography/coalition';
import {getCoalitionLabel, getSelectedCoalitionColumns} from '@/app/utils/demography/coalition';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {overlayMemory} from '@utils/demography/overlayMemory';
import {DataSourceCitation} from './DataSourceCitation';

type MapPanelProps = {
  columnGroup: keyof typeof choroplethMapVariables;
  displayedColumnSets: Array<SummaryType>;
};

const mapDisplayModes: Array<{
  label: string;
  value: MapControlsStore['mapOptions']['demographicDisplayMode'];
}> = [
  {
    label: 'None',
    value: undefined,
  },
  {
    label: 'Comparison',
    value: DEMOGRAPHIC_MODES.SIDE_BY_SIDE,
  },
  {
    label: 'Overlay',
    value: DEMOGRAPHIC_MODES.OVERLAY,
  },
  {
    label: 'Sized circles',
    value: DEMOGRAPHIC_MODES.SIZED_CIRCLES,
  },
];

export const MapPanel: React.FC<MapPanelProps> = ({columnGroup}) => {
  const demographicDisplayMode = useMapControlsStore(
    state => state.mapOptions.demographicDisplayMode
  );
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const superDraw = useToolbarStore(state => state.superDraw);
  const isOverlay = demographicDisplayMode === DEMOGRAPHIC_MODES.OVERLAY;
  // Draw mode keeps the choropleth simple: overlay only, no side-by-side view.
  const displayModes = superDraw
    ? mapDisplayModes
    : mapDisplayModes.filter(m => m.value !== DEMOGRAPHIC_MODES.SIDE_BY_SIDE);

  const variable = useDemographyStore(state => state.variable);
  const variant = useDemographyStore(state => state.variant);
  const setVariable = useDemographyStore(state => state.setVariable);
  const setVariant = useDemographyStore(state => state.setVariant);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);
  useDemographyStore(state => state.coalitionHash);

  const scale = useDemographyStore(state => state.scale);
  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const dataHash = useDemographyStore(state => state.dataHash);
  const availableMapVariables = useDemographyStore(state => state.availableColumnSets.map);
  // The population choropleth spans both universes: shading by VAP shouldn't
  // require switching the evaluation table's summary type first. Elections stay
  // on their own group. Labels already disambiguate ("Black" vs "VAP Black").
  const variableGroups = useMemo<SummaryType[]>(
    () =>
      isCoalitionUniverse(columnGroup) ? [SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP] : [columnGroup],
    [columnGroup]
  );
  const coalitionOptionFor = (universe: SummaryType) => {
    if (!isCoalitionUniverse(universe)) return [];
    // Coalitions are a Super Draw feature. Plain Draw only keeps the entry
    // when it's the active variable (a coalition set up in Super Draw must
    // not leave a dangling selection behind).
    if (!superDraw && variable !== COALITION_VARIABLE_BY_UNIVERSE[universe]) return [];
    const coalitionColumns = getSelectedCoalitionColumns({
      selectedGroups: coalitionGroups,
      availableColumns: demographyService.availableColumns,
      universe: universe as CoalitionUniverse,
    });
    if (!coalitionColumns.length) return [];
    const label = getCoalitionLabel({
      selectedGroups: coalitionGroups,
      availableColumns: demographyService.availableColumns,
      universe,
    });
    return [
      {
        // Both universes produce the same coalition label, so mark the VAP one.
        label: universe === SUMMARY_TYPES.VAP ? `VAP ${label}` : label,
        value: COALITION_VARIABLE_BY_UNIVERSE[universe],
        variants: ['percent', 'raw'] as Array<'percent' | 'raw'>,
        fixedScale: undefined,
        customLegendLabels: undefined,
        expression: undefined,
      },
    ];
  };
  const currentVariableList = useMemo(
    () =>
      variableGroups.flatMap(group => {
        const baseList = availableMapVariables[group] ?? [];
        // Skip the coalition entry for a group with no data on this map.
        return baseList.length ? [...baseList, ...coalitionOptionFor(group)] : [];
      }),
    [availableMapVariables, variableGroups, coalitionGroups, dataHash, superDraw, variable]
  );
  const mapVariableConfig = currentVariableList.find(f => f.value === variable);

  const handleSetMapMode = (newMode: MapControlsStore['mapOptions']['demographicDisplayMode']) => {
    setMapOptions({demographicDisplayMode: newMode});
    // Toggling a layer on registers it with the Visual settings toggle:
    // remember the display mode (overlay vs. comparison) and the variable
    // it's showing.
    if (newMode) {
      overlayMemory.displayMode = newMode;
      const effectiveVariable = mapVariableConfig ? variable : currentVariableList[0]?.value;
      if (effectiveVariable)
        overlayMemory.variables[toOverlayGroup(columnGroup)] = effectiveVariable;
    }
    if (!mapVariableConfig && currentVariableList.length) {
      setVariable(currentVariableList[0].value);
    }
    // Sized circles encode the count in the circle size; shade by share
    if (
      newMode === DEMOGRAPHIC_MODES.SIZED_CIRCLES &&
      mapVariableConfig?.variants?.includes('percent')
    ) {
      setVariant('percent');
    }
  };

  const canBePercent = mapVariableConfig?.variants?.includes('percent');
  // Continuous (fixed partisan, unclassed percent, or total) scales ignore binning;
  // only raw-count variants of demographic groups use quantile bins
  const usesBins =
    !mapVariableConfig?.fixedScale &&
    !!mapVariableConfig?.variants &&
    !(canBePercent && variant === 'percent');
  const labelFormat =
    canBePercent && variant === 'percent' ? NUMBER_FORMATS.PERCENT : NUMBER_FORMATS.COMPACT;
  const isContinuousScale = !!scale && !('invertExtent' in scale);
  const colors = scale && !isContinuousScale ? scale.range() : [];
  const scaleDomain = isContinuousScale && scale ? scale.domain() : [0, 1];
  const [domainMin, domainMax] = [scaleDomain[0], scaleDomain[scaleDomain.length - 1]];
  const continuousLegendLabels =
    mapVariableConfig?.customLegendLabels ??
    Array.from(
      {length: 5},
      (_, i) => formatNumber(domainMin + ((domainMax - domainMin) * i) / 4, labelFormat) ?? ''
    );
  const continuousLegendColors = useMemo(() => {
    if (!isContinuousScale || !scale) return [];
    return Array.from(
      {length: 11},
      (_, i) => scale(domainMin + ((domainMax - domainMin) * i) / 10) as string
    );
  }, [isContinuousScale, scale, domainMin, domainMax]);

  const handleChangeVariable = (newVariable: DemographyVariable) => {
    setVariable(newVariable);
    // Remember the choice so the Visual settings overlay toggle restores it.
    overlayMemory.variables[toOverlayGroup(columnGroup)] = newVariable;
  };

  const handleChangePercent = (usePercent: boolean) => {
    setVariant(usePercent ? 'percent' : 'raw');
  };

  if (!Object.keys(availableMapVariables).length) {
    return (
      <Blockquote color="crimson">
        <Text>Demographic data are not available for this map. </Text>
      </Blockquote>
    );
  }
  return (
    <Flex direction="column" gap="2">
      <Flex direction="row" gap="3" align="start" className="rounded-md" wrap="wrap">
        <Text size="2" weight="medium" className="pt-[2px]">
          Display mode
        </Text>
        <RadioGroup.Root
          size="1"
          value={demographicDisplayMode ?? 'none'}
          onValueChange={v =>
            handleSetMapMode(
              v === 'none'
                ? undefined
                : (v as MapControlsStore['mapOptions']['demographicDisplayMode'])
            )
          }
        >
          <Flex direction="row" gapX="3" gapY="1" wrap="wrap">
            {displayModes.map((option, i) => (
              <RadioGroup.Item key={i} value={option.value ?? 'none'}>
                {option.label}
              </RadioGroup.Item>
            ))}
          </Flex>
        </RadioGroup.Root>
      </Flex>
      {demographicDisplayMode !== undefined && (
        <>
          <Flex direction="column" gap="2">
            <Flex direction="row" gap="3" align="center" wrap="wrap">
              <Text size="2" weight="medium">
                {columnGroup === 'VOTERHISTORY' ? 'Choose Election' : 'Choose Population'}
              </Text>
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

              {!!mapVariableConfig && superDraw && (
                <Popover.Root>
                  <Popover.Trigger>
                    <GearIcon />
                  </Popover.Trigger>
                  <Popover.Content>
                    <Flex direction={'column'} gapY="2">
                      <Heading as="h3" size="3">
                        Choropleth Map Settings
                      </Heading>
                      {usesBins && (
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
                      )}
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
                    </Flex>
                  </Popover.Content>
                </Popover.Root>
              )}
            </Flex>
            {/* The old overlay presets are gone; opacity is slider-driven in
                every mode. Painted-district visibility stays a Map options
                checkbox. */}
            {isOverlay && !!mapVariableConfig && (
              <Flex direction="column" gapY="2">
                <Text size="2" weight="medium">
                  Overlay layer opacity
                </Text>
                <Slider
                  value={[mapOptions.overlayOpacity]}
                  onValueChange={value => setMapOptions({overlayOpacity: value[0]})}
                  min={0}
                  max={1}
                  step={0.01}
                />
                {superDraw && (
                  <>
                    <Text size="2" weight="medium">
                      Districts layer opacity
                    </Text>
                    <Slider
                      value={[mapOptions.zonesOpacity ?? 1]}
                      onValueChange={value => setMapOptions({zonesOpacity: value[0]})}
                      min={0}
                      max={1}
                      step={0.01}
                    />
                  </>
                )}
              </Flex>
            )}
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
          ) : !!mapVariableConfig && isContinuousScale ? (
            <Flex direction={'column'} justify="center" gapX="2" width="100%">
              <LinearGradient
                colors={continuousLegendColors}
                numTicks={continuousLegendLabels.length}
              />
              <Flex direction={'row'} width="100%" justify="between">
                {continuousLegendLabels.map((label: string, i: number) => (
                  <Text key={`legend-label-${i}`}>{label}</Text>
                ))}
              </Flex>
            </Flex>
          ) : null}
          {!!mapVariableConfig && demographicDisplayMode === DEMOGRAPHIC_MODES.SIDE_BY_SIDE && (
            <Text size="1" color="gray" align="center">
              Gray = zero population
            </Text>
          )}
          {!!mapVariableConfig && demographicDisplayMode === DEMOGRAPHIC_MODES.SIZED_CIRCLES && (
            <Text size="2" align="center">
              Circle area scales with total population
            </Text>
          )}
          {!!mapVariableConfig && (
            <DataSourceCitation elections={columnGroup === SUMMARY_TYPES.VOTERHISTORY} />
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
