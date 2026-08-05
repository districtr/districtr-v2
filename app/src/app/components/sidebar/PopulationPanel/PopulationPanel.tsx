import {Flex, Heading, IconButton, Spinner, Text} from '@radix-ui/themes';
import React, {useMemo, useState} from 'react';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {
  PopulationChart,
  PopulationChartAxis,
  PopulationChartIdealLabel,
  POP_CHART_AXIS_HEIGHT,
  POP_CHART_LABEL_HEIGHT,
  POP_CHART_MARGINS,
  getBarCenterY,
  getChartHeight,
} from './PopulationChart/PopulationChart';
import {DistrictMeters} from './DistrictMeters';
import {Pencil1Icon} from '@radix-ui/react-icons';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {ZoneDescriptionPopover} from './ZoneDescriptionPopover';
import {ConditionalScrollArea} from '../ConditionalScrollArea';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {getCommunityRenderOrderId, getUnusedCommunityColors} from '@/app/utils/communities';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {EditCommunityDialog} from '@/app/components/Toolbar/EditCommunityDialog';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {MAP_MODES, MAP_MODE_LABELS} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

// The "Ideal" label and the axis render in separate fixed strips above/below the
// (scrollable) rows, so all three rows must use the same fixed left column width to
// keep their x-scales aligned.
const POP_ROW_HEIGHT = 38;
const POP_LEFT_COL_WIDTH = '5rem';
// The left column stacks fixed-height rows (align-center); this spacer lines their
// centers up with the chart's bars. Derived from the chart's bar geometry.
const POP_LEFT_COL_TOP_SPACER =
  getBarCenterY(POP_CHART_MARGINS.top, POP_ROW_HEIGHT) - POP_ROW_HEIGHT / 2;

export const PopulationPanel = () => {
  const {populationData, demoIsLoaded} = useZonePopulations();
  const {summaryStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const zoneLabel = MAP_MODE_LABELS[mapMode];
  const isCommunityMode = mapMode === MAP_MODES.COI;
  const effectiveIdealPopulation = isCommunityMode ? undefined : idealPopulation;

  const chartOptions = useChartStore(state => state.chartOptions);
  const showDistrictNumbers = chartOptions.popShowDistrictNumbers;
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const communities = useMapStore(state => state.communities);
  const updateCommunity = useMapStore(state => state.updateCommunity);
  const getZoneColor = useZoneColorGetter();
  const isEditing = useMapControlsStore(state => state.isEditing);
  const shouldUseScrollableRows = populationData.length > 10;
  const selectCommunity = useSelectCommunity();
  const colorScheme = useColorScheme();
  const [editingCommunityId, setEditingCommunityId] = useState<number | null>(null);
  const editingCommunity = useMemo(
    () => communities.find(community => community.id === editingCommunityId) ?? null,
    [communities, editingCommunityId]
  );
  const availableEditColors = useMemo(() => {
    if (!editingCommunity) return [];
    return Array.from(
      new Set([editingCommunity.color, ...getUnusedCommunityColors(communities, colorScheme)])
    );
  }, [communities, colorScheme, editingCommunity]);
  const handleEditCommunity = (zone: number) => {
    selectCommunity(zone);
    setEditingCommunityId(zone);
  };
  const handleUpdateCommunity = ({
    name,
    description,
    color,
  }: {
    name: string;
    description: string;
    color: string;
  }) => {
    if (editingCommunityId === null) return;
    updateCommunity(editingCommunityId, {name, description, color});
    setEditingCommunityId(null);
  };
  if (populationData.length === 0) {
    return (
      <Text color="gray" size="2">
        No data to display
      </Text>
    );
  }
  if (!mapDocument) {
    return (
      <Flex dir="column" justify="center" align="center" p="4">
        <Text size="2" className="ml-2">
          Choose a map to display population data
        </Text>
      </Flex>
    );
  }
  if (!demoIsLoaded) {
    return (
      <Flex dir="column" justify="center" align="center" p="4">
        <Spinner />
        <Text size="2" className="ml-2">
          Loading population data...
        </Text>
      </Flex>
    );
  }
  return (
    <Flex
      gap="0"
      direction="column"
      style={
        shouldUseScrollableRows ? {maxHeight: '80vh', overflow: 'hidden'} : {maxHeight: '80vh'}
      }
    >
      {/* The Population tab already names the panel; only COI mode (with its
          different zone label) keeps a heading. */}
      {isCommunityMode && (
        <Flex direction="row" gap={'2'} align="center">
          <Heading as="h3" size="3">
            {`Total population by ${zoneLabel}`}
          </Heading>
        </Flex>
      )}
      {/* Districts render as population meters; the visx bar chart remains for
          COI mode, which has no ideal population to meter against. */}
      {!isCommunityMode ? (
        <DistrictMeters />
      ) : (
        <>
          {/* Fixed header: lock-all control + "Ideal" label strip. Never scrolls.
          align="center" on this row matters: the default cross-axis "stretch" would
          force the left column to its sibling strip's height (POP_CHART_LABEL_HEIGHT)
          instead of the icon's natural size, centering the lock-all icon at a
          different height than the per-district rows' own lock icons. */}
          <Flex direction="row" width={'100%'} gap="1" mt="2" align="center">
            <Flex justify="end" align="center" style={{width: POP_LEFT_COL_WIDTH, flexShrink: 0}} />
            <ParentSize style={{height: `${POP_CHART_LABEL_HEIGHT}px`, width: '100%'}}>
              {({width}) => (
                <PopulationChartIdealLabel
                  width={width}
                  data={populationData}
                  idealPopulation={effectiveIdealPopulation}
                />
              )}
            </ParentSize>
          </Flex>
          <div style={{position: 'relative'}}>
            <ConditionalScrollArea
              shouldUseScrollableRows={shouldUseScrollableRows}
              // Show 10.6 rows so the half-visible row signals more content below;
              // 60vh keeps the panel usable on short viewports.
              maxHeight={`min(60vh, ${POP_CHART_MARGINS.top + Math.round(10.6 * POP_ROW_HEIGHT)}px)`}
            >
              <Flex direction="row" width={'100%'} gap="1">
                <Flex
                  direction={'column'}
                  className={'flex-grow-0 p-0'}
                  style={{width: POP_LEFT_COL_WIDTH, flexShrink: 0}}
                >
                  <Flex style={{height: POP_LEFT_COL_TOP_SPACER}} />
                  {/* @ts-ignore */}
                  {populationData.map(d => (
                    <Flex
                      key={d.zone}
                      direction={'row'}
                      gapX="1"
                      align={'center'}
                      className="p-0 m-0"
                      justify={'between'}
                      style={{height: POP_ROW_HEIGHT}}
                    >
                      {!!showDistrictNumbers && (
                        <IconButton
                          variant={'outline'}
                          onClick={() => selectCommunity(d.zone)}
                          size="1"
                          className={`${selectedZone === d.zone ? 'bg-gray-100' : '!shadow-none'} max-w-12 flex-grow`}
                        >
                          <Text weight={selectedZone === d.zone ? 'bold' : 'regular'}>
                            {mapMode === MAP_MODES.COI
                              ? (getCommunityRenderOrderId(communities, d.zone) ?? d.zone)
                              : d.zone}
                          </Text>
                        </IconButton>
                      )}
                      <Flex gap="0" align="center">
                        <ZoneDescriptionPopover zone={d.zone} color={getZoneColor(d.zone)} />
                        {!!isEditing && (
                          <IconButton
                            onClick={() => handleEditCommunity(d.zone)}
                            variant="ghost"
                            size="1"
                            disabled={access === ACCESS_STATES.READ}
                            aria-label={`Edit community ${d.zone}`}
                          >
                            <Pencil1Icon />
                          </IconButton>
                        )}
                      </Flex>
                    </Flex>
                  ))}
                </Flex>
                <ParentSize
                  style={{
                    height: `${getChartHeight(populationData.length, POP_ROW_HEIGHT)}px`,
                    width: '100%',
                  }}
                >
                  {({width}) => (
                    <PopulationChart
                      width={width}
                      rowHeight={POP_ROW_HEIGHT}
                      data={populationData}
                      idealPopulation={effectiveIdealPopulation}
                      onBarSelect={selectCommunity}
                    />
                  )}
                </ParentSize>
              </Flex>
            </ConditionalScrollArea>
          </div>
          {/* Fixed axis strip below the scrollable rows. Never scrolls. */}
          <Flex direction="row" width={'100%'} gap="1">
            <Flex style={{width: POP_LEFT_COL_WIDTH, flexShrink: 0}} />
            <ParentSize style={{height: `${POP_CHART_AXIS_HEIGHT}px`, width: '100%'}}>
              {({width}) => (
                <PopulationChartAxis
                  width={width}
                  data={populationData}
                  idealPopulation={effectiveIdealPopulation}
                />
              )}
            </ParentSize>
          </Flex>
        </>
      )}
      {editingCommunity && (
        <EditCommunityDialog
          open={editingCommunityId !== null}
          onOpenChange={open => {
            if (!open) setEditingCommunityId(null);
          }}
          onSubmit={handleUpdateCommunity}
          mode="edit"
          defaultName={editingCommunity.name}
          defaultDescription={editingCommunity.description}
          defaultColor={editingCommunity.color}
          availableColors={availableEditColors}
        />
      )}
    </Flex>
  );
};
