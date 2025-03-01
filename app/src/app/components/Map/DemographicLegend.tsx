'use client';
import {
  AllDemographyVariables,
  DemographyVariable,
  demographyVariables,
} from '@/app/store/demographicMap';
import {useDemographyStore} from '@/app/store/demographicMap';
import {formatNumber} from '@/app/utils/numbers';
import {MinusIcon, PlusIcon} from '@radix-ui/react-icons';
import {Box, Flex, IconButton, Switch, Text} from '@radix-ui/themes';
import {Select} from '@radix-ui/themes';
import {LegendQuantile, LegendItem, LegendLabel, LegendLinear} from '@visx/legend';
import {useEffect} from 'react';
import {Tooltip} from '@radix-ui/themes';

export const DemographicLegend: React.FC = () => {
  const variable = useDemographyStore(state => state.variable);
  const displayVariable = variable.replace('_pct', '');
  const config = demographyVariables.find(f => f.value === displayVariable);
  const setVariable = useDemographyStore(state => state.setVariable);
  const scale = useDemographyStore(state => state.scale);
  const numberOfBins = useDemographyStore(state => state.numberOfBins);
  const customBins = useDemographyStore(state => state.customBins);
  const setNumberOfBins = useDemographyStore(state => state.setNumberOfBins);
  const setCustomBins = useDemographyStore(state => state.setCustomBins);

  const handleChange = (_newVariable?: DemographyVariable, _usePercent?: boolean) => {
    const usePercent = _usePercent ?? variable.includes('pct');
    const newVariable = _newVariable ?? config?.value;
    if (!newVariable) return;
    const hasPctVariable = !newVariable?.includes('total');
    const newVariableName: AllDemographyVariables =
      usePercent && hasPctVariable ? `${newVariable}_pct` : newVariable;
    setVariable(newVariableName);
  };

  const incrementBins = (direction: '+' | '-') => {
    setNumberOfBins(numberOfBins + direction === '+' ? 1 : -1);
  };

  useEffect(() => {
    setVariable('total_pop');
  }, []);

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
              checked={variable.includes('pct')}
              onCheckedChange={value => {
                handleChange(undefined, value);
              }}
            />
            Show Percent
          </Flex>
        </Text>
      </Flex>
      {!!scale && (
        <Flex direction={'row'}>
          <Box>
            {/* <LegendQuantile
              scale={scale as any}
              labelFormat={label =>
                formatNumber(label as number, variable.includes('pct') ? 'percent' : 'compact')
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
            </LegendQuantile> */}
          </Box>
          <Tooltip content="Add another bin">
            <IconButton onClick={() => incrementBins('+')} disabled={numberOfBins >= 9}>
              <PlusIcon />
            </IconButton>
          </Tooltip>
          <Tooltip content="Remove a bin">
            <IconButton onClick={() => incrementBins('-')} disabled={numberOfBins <= 2}>
              <MinusIcon />
            </IconButton>
          </Tooltip>
        </Flex>
      )}
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
