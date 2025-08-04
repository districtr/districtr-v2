import {Flex, Heading, IconButton, Spinner, Text} from '@radix-ui/themes';
import React from 'react';
import {formatNumber} from '@utils/numbers';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import InfoTip from '@components/InfoTip';
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {PopulationChart} from './PopulationChart/PopulationChart';
import {PopulationPanelOptions} from './PopulationPanelOptions';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/layers';

const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones

export const PopulationPanel = () => {
  const {populationData, demoIsLoaded} = useZonePopulations();
  const {summaryStats, zoneStats} = useSummaryStats();
  const isEditing = useMapStore(state => state.isEditing);
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

  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const showDistrictNumbers = chartOptions.popShowDistrictNumbers;
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const setLockedZones = useMapStore(state => state.setLockedZones);
  const toggleLockAllAreas = useMapStore(state => state.toggleLockAllAreas);
  const allAreLocked = populationData.every((d: any) => lockPaintedAreas?.includes(d.zone));
  const setSelectedZone = useMapStore(state => state.setSelectedZone);
  const selectedZone = useMapStore(state => state.selectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
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
    <Flex gap="0" direction="column">
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
      <Flex direction="row" width={'100%'} gap="1">
        <Flex
          direction={'column'}
          gap={'2'}
          className="flex-grow-0 p-0 pb-[80px]"
          justify={'between'}
        >
          <Flex justify="end">
              <IconButton onClick={toggleLockAllAreas} variant="ghost" disabled={access === 'read'} className={`${isEditing ? 'opacity-100' : 'opacity-0'}`}>
                {allAreLocked ? <LockClosedIcon /> : <LockOpen2Icon />}
              </IconButton>
          </Flex>
          {/* @ts-ignore */}
          {populationData.map((d, i) => (
            <Flex
              key={d.zone}
              direction={'row'}
              gapY={'1'}
              gapX="3"
              align={'center'}
              className="p-0 m-0"
              justify={'between'}
            >
              {!!showDistrictNumbers &&
                (isEditing ? (
                  <IconButton variant="ghost" onClick={() => setSelectedZone(d.zone)}>
                    <Text weight={selectedZone === d.zone ? 'bold' : 'regular'}>{d.zone}</Text>
                  </IconButton>
                ) : (
                  <Text>{d.zone}</Text>
                ))}
              {isEditing && (
                <IconButton
                  onClick={() => handleLockChange(d.zone)}
                  variant="ghost"
                  disabled={access === 'read'}
                >
                  {lockPaintedAreas.includes(d.zone) ? <LockClosedIcon /> : <LockOpen2Icon />}
                </IconButton>
              )}
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
              idealPopulation={idealPopulation}
            />
          )}
        </ParentSize>
      </Flex>
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
