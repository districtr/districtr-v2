import {CheckboxGroup, Flex, IconButton, Radio, Text, TextField} from '@radix-ui/themes';
import React from 'react'; // Import ParentSize
import {Popover} from '@radix-ui/themes';
import {GearIcon} from '@radix-ui/react-icons';
import InfoTip from '@components/InfoTip';
import {ChartStore} from '@store/chartStore';

export const PopulationPanelOptions: React.FC<{
  chartOptions: ChartStore['chartOptions'];
  setChartOptions: ChartStore['setChartOptions'];
  idealPopulation?: number;
}> = ({chartOptions, setChartOptions, idealPopulation}) => {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <IconButton
          variant="ghost"
          size="3"
          aria-label="Choose map districtr assignment brush color"
        >
          <GearIcon />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content>
        <CheckboxGroup.Root
          defaultValue={[]}
          name="districts"
          value={[
            chartOptions.popBarScaleToCurrent ? 'scaleToCurrent' : '',
            chartOptions.popShowDistrictNumbers ? 'numbers' : '',
            chartOptions.popShowPopNumbers ? 'pops' : '',
            chartOptions.popShowTopBottomDeviation ? 'topBottomDeviation' : '',
          ]}
        >
          <CheckboxGroup.Item
            value="pops"
            onClick={() => setChartOptions({popShowPopNumbers: !chartOptions.popShowPopNumbers})}
            className="cursor-pointer"
          >
            Show population numbers
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="topBottomDeviation"
            onClick={() =>
              setChartOptions({popShowTopBottomDeviation: !chartOptions.popShowTopBottomDeviation})
            }
            className="cursor-pointer"
          >
            Show top-to-bottom deviation numbers
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="numbers"
            onClick={() =>
              setChartOptions({popShowDistrictNumbers: !chartOptions.popShowDistrictNumbers})
            }
            className="cursor-pointer"
          >
            Show district zone numbers
          </CheckboxGroup.Item>
        </CheckboxGroup.Root>
        <Flex direction="column" gap="1" py="2" mt="2">
          <Text size="2">
            X-Axis bar scaling
            <InfoTip tips="barScaling" />
          </Text>
          <Flex
            direction="row"
            align="center"
            gap="2"
            onClick={() =>
              setChartOptions({popBarScaleToCurrent: !chartOptions.popBarScaleToCurrent})
            }
            className="cursor-pointer"
          >
            <Radio
              name="Scale bars default"
              value="default"
              checked={!chartOptions.popBarScaleToCurrent}
            />
            <Text size={'2'}>Scale bars from zero to ideal (default)</Text>
          </Flex>
          <Flex
            direction="row"
            align="center"
            gap="2"
            onClick={() =>
              setChartOptions({popBarScaleToCurrent: !chartOptions.popBarScaleToCurrent})
            }
            className="cursor-pointer"
          >
            <Radio
              name="Scale bars to zone populations"
              value="zones"
              checked={chartOptions.popBarScaleToCurrent}
            />
            <Text size={'2'}>Scale bars to current zone population range</Text>
          </Flex>

      {!!idealPopulation && (
        <Flex direction="column" align="start" gapX="2" pt="2">
          <Text className="py-2">
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
      </Popover.Content>
    </Popover.Root>
  );
};
