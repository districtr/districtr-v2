'use client';
import {
  AllDemographyVariables,
  DemographyVariable,
  demographyVariables
} from '@/app/store/demographicMap';
import { useDemographicMapStore } from '@/app/store/mapStore';
import {formatNumber} from '@/app/utils/numbers';
import {Flex, Switch, Text} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendQuantile, LegendItem, LegendLabel, LegendLinear} from '@visx/legend';
import { useEffect } from 'react';

export const DemographicLegend: React.FC = () => {
  const variable = useDemographicMapStore(state => state.variable);
  const displayVariable = variable.replace('_percent', '');
  const config = demographyVariables.find(f => f.value === displayVariable);
  const setVariable = useDemographicMapStore(state => state.setVariable);
  const scale = useDemographicMapStore(state => state.scale);

  const handleChange = (_newVariable?: DemographyVariable, _usePercent?: boolean) => {
    const usePercent = _usePercent ?? variable.includes('percent');
    const newVariable = _newVariable ?? config?.value;
    if (!newVariable) return;
    const hasPctVariable = !newVariable?.includes('total');
    const newVariableName: AllDemographyVariables =
      usePercent && hasPctVariable ? `${newVariable}_percent` : newVariable;
    setVariable(newVariableName);
  };
  useEffect(() => {
    setVariable('total_pop');
  }, [])

  return (
    <Flex
      direction="column"
      className="absolute left-[50%] bottom-4 bg-white z-100 p-2 border-[1px] border-gray-300 shadow-md"
      style={{
        transform: 'translateX(-50%)',
      }}
    >
      <Flex direction="row" align={'center'} justify={'center'} gapX="3">
        <Select.Root
          value={displayVariable}
          onValueChange={value => {
            handleChange(value as DemographyVariable);
          }}
        >
          <Select.Trigger />
          <Select.Content>
            {demographyVariables.map(f => (
              <Select.Item key={f.value} value={f.value}>
                {f.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Text as="label" size="2">
          <Flex gap="2">
            <Switch
              checked={variable.includes('percent')}
              onCheckedChange={value => {
                handleChange(undefined, value);
              }}
            />
            Show Percent
          </Flex>
        </Text>
      </Flex>
      {!!scale && <LegendQuantile
        scale={scale}
        labelFormat={label =>
          formatNumber(label as number, variable.includes('percent') ? 'percent' : 'compact')
        }
      >
        {labels =>
          labels.map((label, i) => (
            <LegendItem
              key={`legend-${i}`}
              onClick={() => {
                // if (events) alert(`clicked: ${JSON.stringify(label)}`);
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  backgroundColor: label.value,
                }}
              ></span>
              <LegendLabel align="left" margin="0 4px">
                {label.text}
              </LegendLabel>
            </LegendItem>
          ))
        }
      </LegendQuantile>}
      {/* {!!scale && <LegendLinear 
        scale={scale} 
        labelFormat={label => formatNumber(label as number, variable.includes('percent') ? 'percent' : 'compact')}>
        {labels => labels.map((label, i) => (
          <LegendItem key={`legend-${i}`} margin="0 4px">
            <svg width={10} height={10}>
              <rect fill={label.value} width={10} height={10} />
            </svg>
            <LegendLabel align="left" margin="0 4px">
              {label.text}
            </LegendLabel>
          </LegendItem>
        ))}
        </LegendLinear>} */}
      <Text size="2" align="center">
        Gray = zero population
      </Text>
    </Flex>
  );
};
