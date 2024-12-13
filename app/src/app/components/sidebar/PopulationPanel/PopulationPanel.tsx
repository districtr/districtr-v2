import {Flex, Heading, IconButton, Text, TextField} from '@radix-ui/themes';
import React, {useMemo} from 'react';
import {formatNumber} from '@utils/numbers';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import InfoTip from '@components/InfoTip';
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {calculateMinMaxRange} from '@utils/zone-helpers';
import {PopulationChart} from './PopulationChart/PopulationChart';
import {PopulationPanelOptions} from './PopulationPanelOptions';

export const PopulationPanel = () => {
  const mapMetrics = useChartStore(state => state.mapMetrics);
  const summaryStats = useMapStore(state => state.summaryStats);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const idealPopulation = summaryStats?.idealpop?.data;
  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones
  const {chartData, stats} = useMemo(() => {
    if (mapMetrics && mapMetrics.data && numDistricts) {
      const chartData = Array.from({length: numDistricts}, (_, i) => i + 1).reduce(
        (acc, district) => {
          const totalPop = mapMetrics.data.reduce((acc, entry) => {
            return entry.zone === district ? acc + entry.total_pop : acc;
          }, 0);
          return [...acc, {zone: district, total_pop: totalPop}];
        },
        [] as Array<{zone: number; total_pop: number}>
      );
      const allAreNonZero = chartData.every(entry => entry.total_pop > 0);
      const stats = allAreNonZero ? calculateMinMaxRange(chartData) : undefined;
      return {
        stats,
        chartData,
      };
    } else {
      return {
        stats: undefined,
        chartData: [],
      };
    }
  }, [mapMetrics]);

  if (mapMetrics?.isPending) {
    return <div>Loading...</div>;
  }

  if (mapMetrics?.isError) {
    return <div>Error: {mapMetrics?.error.message}</div>;
  }

  if (!mapMetrics || mapMetrics.data.length === 0) {
    return (
      <Text color="gray" size="2">
        No data to display
      </Text>
    );
  }

  return (
    <Flex gap="3" direction="column">
      <Flex direction="row" gap={'2'} align="center">
        <Heading as="h3" size="3">
          Total population by district
        </Heading>
        <PopulationPanelOptions chartOptions={chartOptions} setChartOptions={setChartOptions} />
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
            lockPaintedAreas={lockPaintedAreas}
          />
        )}
      </ParentSize>
      {!!idealPopulation && (
        <Flex direction={'row'} justify={'between'} align={'start'}>
          <Flex direction="column" gapX="2" minWidth={'10rem'}>
            <Text>Ideal Population</Text>
            <Text weight={'bold'}>{formatNumber(idealPopulation, 'string')}</Text>
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
      {!!idealPopulation && (
        <Flex direction="row" align="start" gapX="2" pt="2">
          <Text>
            Target deviation from ideal
            <InfoTip tips="maxDeviation" />
          </Text>
          <Flex direction="row" align="center" gapX="2" flexGrow={'1'}>
            <Flex direction="column" flexGrow={'1'}>
              <TextField.Root
                placeholder="% Deviation"
                type="number"
                max={100}
                step={0.1}
                value={chartOptions.popTargetPopDeviationPct || undefined}
                onChange={e => {
                  if (e.target.value === '') {
                    setChartOptions({
                      popTargetPopDeviation: undefined,
                      popTargetPopDeviationPct: undefined,
                    });
                  } else {
                    const value = Math.max(0, +e.target.value);
                    setChartOptions({
                      popTargetPopDeviation: Math.round((value / 100) * idealPopulation),
                      popTargetPopDeviationPct: value,
                    });
                  }
                }}
              >
                <TextField.Slot side="right">
                  <IconButton size="1" variant="ghost">
                    %
                  </IconButton>
                </TextField.Slot>
              </TextField.Root>
              <Text size="1">Percent</Text>
            </Flex>
            <Flex direction="column" flexGrow={'1'}>
              <TextField.Root
                placeholder="Pop Deviation"
                type="number"
                value={chartOptions.popTargetPopDeviation || undefined}
                onChange={e => {
                  if (e.target.value === '') {
                    setChartOptions({
                      popTargetPopDeviation: undefined,
                      popTargetPopDeviationPct: undefined,
                    });
                  } else {
                    const value = Math.max(0, +e.target.value);
                    setChartOptions({
                      popTargetPopDeviation: value,
                      popTargetPopDeviationPct: Math.round((value / idealPopulation) * 10000) / 100,
                    });
                  }
                }}
              ></TextField.Root>
              <Text size="1">Population</Text>
            </Flex>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};
