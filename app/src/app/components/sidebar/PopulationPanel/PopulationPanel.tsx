import {Flex, Heading, IconButton, Text} from '@radix-ui/themes';
import React from 'react';
import {formatNumber} from '@utils/numbers';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import InfoTip from '@components/InfoTip';
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {PopulationChart} from './PopulationChart/PopulationChart';
import {PopulationPanelOptions} from './PopulationPanelOptions';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';

const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones

export const PopulationPanel = () => {
  const mapMetrics = useChartStore(state => state.mapMetrics);
  const summaryStats = useMapStore(state => state.summaryStats);
  const idealPopulation = summaryStats?.idealpop;
  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const showDistrictNumbers = chartOptions.popShowDistrictNumbers;
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const totalPopData = useMapStore(state => state.summaryStats.P1);
  const unassigned = useChartStore(state => state.chartInfo.unassigned);
  const chartData = useChartStore(state => state.chartInfo.chartData);
  const stats = useChartStore(state => state.chartInfo.stats);
  const setLockedZones = useMapStore(state => state.setLockedZones);
  const toggleLockAllAreas = useMapStore(state => state.toggleLockAllAreas);
  const allAreLocked = chartData.every(d => lockPaintedAreas?.includes(d.zone));

  const handleLockChange = (zone: number) => {
    if (lockPaintedAreas.includes(zone)) {
      setLockedZones(lockPaintedAreas.filter(f => f !== zone));
    } else {
      setLockedZones([...(lockPaintedAreas || []), zone]);
    }
  };

  if (mapMetrics?.isPending || !totalPopData) {
    return <div>Loading...</div>;
  }

  if (mapMetrics?.isError) {
    return (
      <div>
        Error:{' '}
        {'response' in mapMetrics.error
          ? mapMetrics.error.response.data.detail
          : mapMetrics.error.message}
      </div>
    );
  }
  if (!mapMetrics || mapMetrics.data.length === 0) {
    return (
      <Text color="gray" size="2">
        No data to display
      </Text>
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
            <IconButton onClick={toggleLockAllAreas} variant="ghost" >
              {allAreLocked ? <LockClosedIcon /> : <LockOpen2Icon />}
            </IconButton>
          </Flex>
          {chartData.map((d, i) => (
            <Flex key={d.zone} direction={'row'} gap={'1'} align={'center'} className="p-0 m-0" justify={"between"}>
              {!!showDistrictNumbers && <Text weight={'bold'}>{d.zone}</Text>}
              <IconButton onClick={() => handleLockChange(d.zone)} variant="ghost">
                {lockPaintedAreas.includes(d.zone) ? (
                  <LockClosedIcon />
                ) : (
                  <LockOpen2Icon />
                )}
              </IconButton>
            </Flex>
          ))}
        </Flex>
        <ParentSize
          style={{
            minHeight: chartData.length ? `${chartData.length * 40 + 40}px` : '200px',
            width: '100%',
          }}
        >
          {({width, height}) => (
            <PopulationChart
              width={width}
              height={height}
              data={chartData}
              idealPopulation={idealPopulation}
            />
          )}
        </ParentSize>
      </Flex>
      {!!idealPopulation && (
        <Flex direction={'row'} justify={'between'} align={'start'}>
          <Flex direction="column" gapX="2" minWidth={'10rem'}>
            <Text>Ideal Population</Text>
            <Text weight={'bold'} className="mb-2">
              {formatNumber(idealPopulation, 'string')}
            </Text>
            {unassigned !== null && (
              <>
                <Text>Unassigned</Text>
                <Text weight={'bold'}>{formatNumber(unassigned, 'string')}</Text>
              </>
            )}
          </Flex>

          <Text>
            Top-to-bottom population deviation <InfoTip tips="topToBottomDeviation" />
            <br />
            {stats?.range !== undefined ? (
              <>
                <b>{formatNumber(stats.range / stats.max, 'percent')}</b> (
                {formatNumber(stats.range || 0, 'string')})
              </>
            ) : (
              ' will appear when all districts are started'
            )}{' '}
          </Text>
        </Flex>
      )}
    </Flex>
  );
};
