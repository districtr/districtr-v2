import {CheckboxGroup, Flex, IconButton, Radio, Text} from '@radix-ui/themes';
import React from 'react'; // Import ParentSize
import {Popover} from '@radix-ui/themes';
import {GearIcon} from '@radix-ui/react-icons';
import InfoTip from '@components/InfoTip';
import {ChartStore} from '@store/chartStore';

export const PopulationPanelOptions: React.FC<{
  chartOptions: ChartStore['chartOptions'];
  setChartOptions: ChartStore['setChartOptions'];
}> = ({chartOptions, setChartOptions}) => {
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
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};
