import {Flex, Heading, IconButton, Spinner, Text} from '@radix-ui/themes';
import React, {useMemo, useState} from 'react';
import {formatNumber} from '@utils/numbers';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import InfoTip from '@components/InfoTip';
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {PopulationChart} from './PopulationChart/PopulationChart';
import {PopulationPanelOptions} from './PopulationPanelOptions';
import {LockClosedIcon, LockOpen2Icon, Pencil1Icon} from '@radix-ui/react-icons';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {ZoneDescriptionPopover} from './ZoneDescriptionPopover';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';
import {FALLBACK_NUM_COMMUNITIES} from '@/app/constants/document/limits';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {getCommunityRenderOrderId, getUnusedCommunityColors} from '@/app/utils/communities';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {EditCommunityDialog} from '@/app/components/Toolbar/EditCommunityDialog';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {MAP_MODES, MAP_MODE_LABELS, MAP_MODE_LABEL_PLURAL} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';
import {NUMBER_FORMATS} from '@constants/demography/format';

const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones

export const PopulationPanel = () => {
  const {populationData, demoIsLoaded} = useZonePopulations();
  const {summaryStats, zoneStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const unassigned = summaryStats.unassigned;
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const numDistricts = useMapStore(
    state => state.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS
  );
  const numCommunities = useMapStore(state => state.numCommunities ?? FALLBACK_NUM_COMMUNITIES);
  const numZones = mapMode === MAP_MODES.COI ? numCommunities : numDistricts;
  const zoneLabel = MAP_MODE_LABELS[mapMode];
  const isCommunityMode = mapMode === MAP_MODES.COI;
  const effectiveIdealPopulation = isCommunityMode ? undefined : idealPopulation;
  const zoneLabelPlural = MAP_MODE_LABEL_PLURAL[mapMode];
  const allPainted =
    numZones === populationData.length &&
    zoneStats.minPopulation !== undefined &&
    zoneStats.minPopulation > 0;

  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const showDistrictNumbers = chartOptions.popShowDistrictNumbers;
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const toggleLockAllAreas = useMapControlsStore(state => state.toggleLockAllAreas);
  const allAreLocked = populationData.every((d: any) => lockPaintedAreas?.includes(d.zone));
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const communities = useMapStore(state => state.communities);
  const updateCommunity = useMapStore(state => state.updateCommunity);
  const getZoneColor = useZoneColorGetter();
  const isEditing = useMapControlsStore(state => state.isEditing);
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
  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...(lockPaintedAreas || []), zone]);
    }
  };
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
    <Flex gap="0" direction="column">
      <Flex direction="row" gap={'2'} align="center">
        <Heading as="h3" size="3">
          {`Total population by ${zoneLabel}`}
        </Heading>
        <PopulationPanelOptions
          chartOptions={chartOptions}
          setChartOptions={setChartOptions}
          idealPopulation={effectiveIdealPopulation}
        />
      </Flex>
      <Flex direction="row" width={'100%'} gap="1">
        <Flex
          direction={'column'}
          gap={'2'}
          className={'flex-grow-0 p-0 pb-[80px]'}
          justify={'between'}
          minWidth={'5rem'}
        >
          <Flex justify="end" minHeight={isCommunityMode ? '12px' : '28px'}>
            {!isCommunityMode && (
              <IconButton
                onClick={toggleLockAllAreas}
                variant="ghost"
                disabled={access === ACCESS_STATES.READ}
                style={{opacity: isEditing ? 1 : 0}}
                aria-label={allAreLocked ? 'Unlock all districts' : 'Lock all districts'}
              >
                {allAreLocked ? <LockClosedIcon /> : <LockOpen2Icon />}
              </IconButton>
            )}
          </Flex>
          {/* @ts-ignore */}
          {populationData.map((d, i) => (
            <Flex
              key={d.zone}
              direction={'row'}
              gapY="1"
              gapX="1"
              align={'center'}
              className="p-0 m-0"
              justify={'between'}
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
                  <>
                    {isCommunityMode ? (
                      <IconButton
                        onClick={() => handleEditCommunity(d.zone)}
                        variant="ghost"
                        disabled={access === ACCESS_STATES.READ}
                        aria-label={`Edit community ${d.zone}`}
                      >
                        <Pencil1Icon />
                      </IconButton>
                    ) : (
                      <IconButton
                        onClick={() => handleLockChange(d.zone)}
                        variant="ghost"
                        disabled={access === ACCESS_STATES.READ}
                        aria-label={
                          lockPaintedAreas.includes(d.zone)
                            ? `Unlock district ${d.zone}`
                            : `Lock district ${d.zone}`
                        }
                      >
                        {lockPaintedAreas.includes(d.zone) ? <LockClosedIcon /> : <LockOpen2Icon />}
                      </IconButton>
                    )}
                  </>
                )}
              </Flex>
            </Flex>
          ))}
        </Flex>
        <ParentSize
          style={{
            height: populationData.length ? `${populationData.length * 38 + 76}px` : '200px',
            width: '100%',
          }}
        >
          {({width, height}) => (
            <PopulationChart
              width={width}
              height={height}
              data={populationData}
              idealPopulation={effectiveIdealPopulation}
              onBarSelect={selectCommunity}
            />
          )}
        </ParentSize>
      </Flex>
      {!!idealPopulation && !isCommunityMode && (
        <Flex direction={'row'} justify={'between'} align={'start'} wrap="wrap">
          <Flex direction="column" gapX="2" minWidth={'10rem'}>
            <Text>Ideal Population</Text>
            <Text weight={'bold'} className="mb-2">
              {formatNumber(idealPopulation, NUMBER_FORMATS.STRING)}
            </Text>
            {unassigned !== undefined && (
              <>
                <Text>Unassigned</Text>
                <Text weight={'bold'}>{formatNumber(unassigned, NUMBER_FORMATS.STRING)}</Text>
              </>
            )}
          </Flex>

          <Text>
            Top-to-bottom population deviation <InfoTip tips="topToBottomDeviation" />
            <br />
            {allPainted &&
            zoneStats?.range !== undefined &&
            zoneStats.maxPopulation !== undefined &&
            zoneStats.maxPopulation !== 0 ? (
              <>
                <b>
                  {formatNumber(zoneStats.range / zoneStats.maxPopulation, NUMBER_FORMATS.PERCENT)}
                </b>{' '}
                ({formatNumber(zoneStats.range || 0, NUMBER_FORMATS.STRING)})
              </>
            ) : (
              ` will appear when all ${zoneLabelPlural} are started`
            )}
          </Text>
        </Flex>
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
