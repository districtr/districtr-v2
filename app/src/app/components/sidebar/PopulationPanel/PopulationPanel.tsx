import {CheckboxGroup, Flex, Heading, Text} from '@radix-ui/themes';
import React from 'react';
import {formatNumber} from '@utils/numbers';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import InfoTip from '@components/InfoTip';
import {useChartStore} from '@store/chartStore';
import {useMapStore} from '@store/mapStore';
import {PopulationChart} from './PopulationChart/PopulationChart';
import {PopulationPanelOptions} from './PopulationPanelOptions';

export const PopulationPanel = () => {
  const mapMetrics = useChartStore(state => state.mapMetrics);
  const idealPopulation = useMapStore(state => state.summaryStats?.idealpop?.data);
  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const mapOptions = useMapStore(state => state.mapOptions);
  const setMapOptions = useMapStore(state => state.setMapOptions);
  const chartInfo = useChartStore(state => state.chartInfo);
  const {chartData, stats, unassigned} = chartInfo;

  if (mapMetrics?.isPending) {
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
            <Text weight={'bold'} className="mb-2">
              {formatNumber(idealPopulation, 'string')}
            </Text>
            <Text>Unassigned</Text>
            <Text weight={'bold'}>
              {unassigned >= 0 ? formatNumber(unassigned, 'string') : '--'}
            </Text>
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
      <CheckboxGroup.Root
        defaultValue={[]}
        name="districts"
        value={[
          mapOptions.higlightUnassigned === true ? 'higlightUnassigned' : '',
          mapOptions.showPopulationTooltip === true ? 'showPopulationTooltip' : '',
        ]}
      >
        <hr className="my-2" />
        <Heading as="h3" weight="bold" size="3">
          Map Options
        </Heading>
        <CheckboxGroup.Item
          value="higlightUnassigned"
          onClick={() =>
            setMapOptions({
              higlightUnassigned: !mapOptions.higlightUnassigned,
            })
          }
        >
          Highlight unassigned units
        </CheckboxGroup.Item>
        <CheckboxGroup.Item
          value="showPopulationTooltip"
          onClick={() =>
            setMapOptions({
              showPopulationTooltip: !mapOptions.showPopulationTooltip,
            })
          }
        >
          Show population tooltip
        </CheckboxGroup.Item>
      </CheckboxGroup.Root>
    </Flex>
  );
};
