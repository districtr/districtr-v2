'use client';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {MapControlsStore, useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {GearIcon, MinusIcon, PlusIcon} from '@radix-ui/react-icons';
import {DotDensityLegend} from './DotDensityLegend';
import {ChoroplethLegend} from './ChoroplethLegend';
import {
  Blockquote,
  Checkbox,
  Flex,
  Heading,
  IconButton,
  Popover,
  RadioCards,
  Slider,
  Text,
} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import React, {useMemo} from 'react';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {isAcsColumn} from '@utils/api/summaryStats';
import {demographyService} from '@/app/utils/demography/demographyService';
import {
  ACS_UNIVERSES,
  isAcsUniverse,
  isCoalitionUniverse,
  CoalitionUniverse,
  SUMMARY_TYPES,
  toOverlayGroup,
  type SummaryType,
} from '@constants/demography/summary';
import {COALITION_VARIABLE_BY_UNIVERSE, DemographyVariable} from '@constants/demography/coalition';
import {useCoalitionsEnabled} from '@/app/hooks/useCoalitionsEnabled';
import {getCoalitionLabel, getSelectedCoalitionColumns} from '@/app/utils/demography/coalition';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {overlayMemory} from '@utils/demography/overlayMemory';
import {DataSourceCitation} from './DataSourceCitation';
import {useMapStore} from '@/app/store/mapStore';
import {ACCESS_STATES} from '@constants/document/state';
import {MAP_MODES} from '@constants/map/mode';

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
    label: 'Shaded regions',
    value: DEMOGRAPHIC_MODES.OVERLAY,
  },
  {
    label: 'Sized circles',
    value: DEMOGRAPHIC_MODES.SIZED_CIRCLES,
  },
  {
    label: 'Dot density',
    value: DEMOGRAPHIC_MODES.DOT_DENSITY,
  },
];

export const MapPanel: React.FC<MapPanelProps> = ({columnGroup}) => {
  const demographicDisplayMode = useMapControlsStore(
    state => state.mapOptions.demographicDisplayMode
  );
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const superDraw = useToolbarStore(state => state.superDraw);
  const coalitionsEnabled = useCoalitionsEnabled();
  const isOverlay = demographicDisplayMode === DEMOGRAPHIC_MODES.OVERLAY;
  // Draw mode keeps the choropleth simple: overlay only, no side-by-side view.
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isReadOnlyDoc = useMapStore(state => state.mapDocument?.access === ACCESS_STATES.READ);
  // The dot density renderer only mounts in MainMap (district edit maps);
  // public pages render PublicMap and COI pages render CoiMap, so hide the
  // option where selecting it could not draw anything.
  const supportsDotDensity = mapMode !== MAP_MODES.COI && !isReadOnlyDoc;
  const displayModes = mapDisplayModes.filter(
    m =>
      (superDraw || m.value !== DEMOGRAPHIC_MODES.SIDE_BY_SIDE) &&
      (supportsDotDensity || m.value !== DEMOGRAPHIC_MODES.DOT_DENSITY)
  );

  const variable = useDemographyStore(state => state.variable);
  const variant = useDemographyStore(state => state.variant);
  const setVariable = useDemographyStore(state => state.setVariable);
  const setVariant = useDemographyStore(state => state.setVariant);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);
  useDemographyStore(state => state.coalitionHash);

  const numberOfbins = useDemographyStore(state => state.numberOfBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const dataHash = useDemographyStore(state => state.dataHash);
  const availableMapVariables = useDemographyStore(state => state.availableColumnSets.map);
  // One demographics dropdown spans TOTPOP, VAP, and the ACS universes, so
  // shading by another universe never requires switching the panel's summary
  // type first; universes with no data on this map drop out below. Elections
  // stay on their own group. Labels disambiguate ("Black" vs "VAP Black").
  const variableGroups = useMemo<SummaryType[]>(
    () =>
      isCoalitionUniverse(columnGroup) || isAcsUniverse(columnGroup)
        ? [SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP, ...ACS_UNIVERSES]
        : [columnGroup],
    [columnGroup]
  );
  const coalitionOptionFor = (universe: SummaryType) => {
    if (!isCoalitionUniverse(universe)) return [];
    // Coalition entries only where coalitions are on (Super Draw / COI maps);
    // plain Draw keeps the entry when it's the active variable (a coalition
    // set up in Super Draw must not leave a dangling selection behind).
    if (!coalitionsEnabled && variable !== COALITION_VARIABLE_BY_UNIVERSE[universe]) return [];
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
    [availableMapVariables, variableGroups, coalitionGroups, dataHash, coalitionsEnabled, variable]
  );
  const mapVariableConfig = currentVariableList.find(f => f.value === variable);
  // Each group's control is independent: it reports the display mode only
  // while its own variable drives the map, and shows None otherwise. Picking
  // a mode here takes the map over for this group (handleSetMapMode swaps the
  // variable), flipping the other group's control back to None.
  const ownsMapLayer = !!mapVariableConfig;
  const displayedMode = ownsMapLayer ? demographicDisplayMode : undefined;

  const handleSetMapMode = (newMode: MapControlsStore['mapOptions']['demographicDisplayMode']) => {
    setMapOptions({demographicDisplayMode: newMode});
    // Toggling a layer on registers it with the Visual settings toggle:
    // remember the display mode (overlay vs. comparison) and the variable
    // it's showing.
    // Reactivating an inactive group restores its remembered variable (like
    // activateOverlayGroup), falling back to the group's first.
    const group = toOverlayGroup(columnGroup);
    const remembered = overlayMemory.variables[group];
    const effectiveVariable = mapVariableConfig
      ? variable
      : (currentVariableList.find(f => f.value === remembered) ?? currentVariableList[0])?.value;
    if (newMode) {
      overlayMemory.displayMode = newMode;
      if (effectiveVariable) overlayMemory.variables[group] = effectiveVariable;
    }
    if (!mapVariableConfig && effectiveVariable) {
      setVariable(effectiveVariable);
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
      <Flex direction="row" align="center" gap="3" wrap="wrap">
        <Text size="2" weight="medium">
          Map display mode
        </Text>
        <RadioCards.Root
          size="1"
          gap="2"
          // Flex-wrap instead of grid columns: grid tracks floor at
          // min-content and overflow narrow sidebars, stretching sibling
          // controls past the clip edge; wrapped cards fit any width.
          style={{display: 'flex', flexWrap: 'wrap'}}
          value={displayedMode ?? 'none'}
          onValueChange={v =>
            handleSetMapMode(
              v === 'none'
                ? undefined
                : (v as MapControlsStore['mapOptions']['demographicDisplayMode'])
            )
          }
        >
          {displayModes.map((option, i) => (
            <RadioCards.Item key={i} value={option.value ?? 'none'} className="cursor-pointer">
              <Text size="2">{option.label}</Text>
            </RadioCards.Item>
          ))}
        </RadioCards.Root>
      </Flex>
      {displayedMode === DEMOGRAPHIC_MODES.DOT_DENSITY && <DotDensityLegend />}
      {displayedMode !== undefined && displayedMode !== DEMOGRAPHIC_MODES.DOT_DENSITY && (
        <>
          <Flex direction="column" gap="2">
            <Flex direction="row" gap="3" align="center" wrap="wrap">
              <Text size="2" weight="medium">
                {columnGroup === 'VOTERHISTORY'
                  ? 'Map layer election'
                  : isAcsUniverse(columnGroup)
                    ? 'Map layer variable'
                    : 'Map layer population'}
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
                        Additional Layer Settings
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
              // pr: the thumb at 100% sits half outside the track's own box and
              // was being clipped by the panel's edge.
              <Flex direction="column" gapY="2" pr="2">
                <Text size="2" weight="medium">
                  Shaded region opacity
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

          {!!mapVariableConfig && <ChoroplethLegend />}
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
            <DataSourceCitation
              elections={columnGroup === SUMMARY_TYPES.VOTERHISTORY}
              acs={isAcsColumn(variable)}
            />
          )}
        </>
      )}
    </Flex>
  );
};
