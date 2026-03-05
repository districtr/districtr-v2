import {Box, Flex, Heading, IconButton, ScrollArea, Spinner, Text} from '@radix-ui/themes';
import React from 'react';
import {formatNumber} from '@utils/numbers';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import InfoTip from '@components/InfoTip';
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {PopulationChart} from './PopulationChart/PopulationChart';
import {PopulationPanelOptions} from './PopulationPanelOptions';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {ZoneCommentPopover} from './ZoneCommentPopover';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/map/layerStyle';

const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones

export const PopulationPanel = () => {
  const {populationData, demoIsLoaded} = useZonePopulations();
  const {summaryStats, zoneStats} = useSummaryStats();
  const idealPopulation = summaryStats?.idealpop;
  const unassigned = summaryStats.unassigned;
  const mapDocument = useMapStore(state => state.mapDocument);
  const numDistricts = useMapStore(
    state => state.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS
  );
  const allPainted =
    numDistricts === populationData.length &&
    zoneStats.minPopulation !== undefined &&
    zoneStats.minPopulation > 0;

  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const showDistrictNumbers = chartOptions.popShowDistrictNumbers;
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const toggleLockAllAreas = useMapControlsStore(state => state.toggleLockAllAreas);
  const allAreLocked = populationData.every((d: any) => lockPaintedAreas?.includes(d.zone));
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const colorScheme = useColorScheme();
  const isEditing = useMapControlsStore(state => state.isEditing);
  const shouldUseScrollableRows = populationData.length > 10;
  const chartHeight = populationData.length ? `${populationData.length * 38 + 76}px` : '200px';

  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...(lockPaintedAreas || []), zone]);
    }
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
      <Flex direction="row" gap={'2'} align="center">
        <Heading as="h3" size="3">
          Total population by district
        </Heading>
        <PopulationPanelOptions
          chartOptions={chartOptions}
          setChartOptions={setChartOptions}
          idealPopulation={idealPopulation}
        />
      </Flex>
      <ScrollArea
        scrollbars={shouldUseScrollableRows ? 'vertical' : undefined}
        className="flex-grow-1"
        style={{
          maxHeight: chartHeight,
        }}
      >
        <Flex direction="row" width={'100%'} gap="1">
          <Flex
            direction={'column'}
            gap={'2'}
            className="flex-grow-0 p-0 pb-[80px]"
            justify={'between'}
            minWidth={'5rem'}
          >
            <Flex justify="end" style={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              backgroundColor: 'var(--gray-1)',
            }}>
              <IconButton
                onClick={toggleLockAllAreas}
                variant="ghost"
                disabled={access === 'read'}
                style={{opacity: isEditing ? 1 : 0}}
              >
                {allAreLocked ? <LockClosedIcon /> : <LockOpen2Icon />}
              </IconButton>
            </Flex>
            {/* @ts-ignore */}
            {populationData.map(d => (
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
                    onClick={() => setSelectedZone(d.zone)}
                    size="1"
                    className={`${selectedZone === d.zone ? 'bg-gray-100' : '!shadow-none'} max-w-12 flex-grow`}
                  >
                    <Text weight={selectedZone === d.zone ? 'bold' : 'regular'}>{d.zone}</Text>
                  </IconButton>
                )}
                <Flex gap="0" align="center">
                  <ZoneCommentPopover
                    zone={d.zone}
                    color={colorScheme[(d.zone - 1) % colorScheme.length]}
                  />
                  {!!isEditing && (
                    <IconButton
                      onClick={() => handleLockChange(d.zone)}
                      variant="ghost"
                      disabled={access === 'read'}
                    >
                      {lockPaintedAreas.includes(d.zone) ? <LockClosedIcon /> : <LockOpen2Icon />}
                    </IconButton>
                  )}
                </Flex>
              </Flex>
            ))}
          </Flex>
          <ParentSize
            style={{
              height: chartHeight,
              width: '100%',
            }}
          >
            {({width, height}) => (
              <PopulationChart
                width={width}
                height={height}
                data={populationData}
                idealPopulation={idealPopulation}
                enableStickyRows={shouldUseScrollableRows}
              />
            )}
          </ParentSize>
        </Flex>
        {/* Cover the small overflow on the bottom left */}
        <Box style={{
          backgroundColor: "white",
          width: 80,
          height: 50, 
          position: 'sticky',
          bottom: 0,
          zIndex: 2,
          left: 0,
        }}>
        </Box>
      </ScrollArea>
      {!!idealPopulation && (
        <Flex direction={'row'} justify={'between'} align={'start'} wrap="wrap">
          <Flex direction="column" gapX="2" minWidth={'10rem'}>
            <Text>Ideal Population</Text>
            <Text weight={'bold'} className="mb-2">
              {formatNumber(idealPopulation, 'string')}
            </Text>
            {unassigned !== undefined && (
              <>
                <Text>Unassigned</Text>
                <Text weight={'bold'}>{formatNumber(unassigned, 'string')}</Text>
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
                <b>{formatNumber(zoneStats.range / zoneStats.maxPopulation, 'percent')}</b> (
                {formatNumber(zoneStats.range || 0, 'string')})
              </>
            ) : (
              ' will appear when all districts are started'
            )}
          </Text>
        </Flex>
      )}
    </Flex>
  );
};
