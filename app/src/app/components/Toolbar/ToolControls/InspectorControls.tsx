import {useTooltipStore} from '@store/tooltipStore';
import {CONFIG_BY_COLUMN_SET, summaryStatLabels} from '@store/demography/demographyTableConfig';
import {useDemographyStore} from '@store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {useEffect} from 'react';
import {Flex, RadioGroup, Text} from '@radix-ui/themes';
import {BrushControls} from '@components/Toolbar/ToolControls/BrushControls';
import {CardCheckbox, ResponsiveCheckboxCards} from '@/app/components/Shared/CardCheckbox';
import {SUMMARY_TYPES, TOTAL_COLUMN, type SummaryType} from '@constants/demography/summary';

export const InspectorControls = () => {
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const setInspectorMode = useTooltipStore(state => state.setInspectorMode);
  const setActiveColumns = useTooltipStore(state => state.setActiveColumns);
  const availableSummaries = useDemographyStore(state => state.availableColumnSets.evaluation);
  const availableModes = summaryStatLabels.filter(f => availableSummaries[f.value]);

  // Total is always active, not a toggle; order by universe totals, voter
  // history stays chronological.
  const universeTotals = demographyService.universeTotals;
  const columnList = CONFIG_BY_COLUMN_SET[inspectorMode].filter(
    f => !f.isTotal && demographyService.availableColumns.includes(f.sourceCol ?? f.column)
  );
  if (inspectorMode !== SUMMARY_TYPES.VOTERHISTORY) {
    columnList.sort(
      (a, b) => (universeTotals?.[b.column] ?? 0) - (universeTotals?.[a.column] ?? 0)
    );
  }

  const totalColumn = TOTAL_COLUMN[inspectorMode];
  const totalColumns = totalColumn ? [totalColumn] : [];

  useEffect(() => {
    setActiveColumns([...totalColumns, ...columnList.map(f => f.column)]);
  }, [inspectorMode, setActiveColumns]);

  useEffect(() => {
    if (availableModes.length && !availableModes.some(f => f.value === inspectorMode)) {
      setInspectorMode(availableModes[0].value);
    }
  }, [availableModes, inspectorMode, setInspectorMode]);

  return (
    <Flex direction="column" gapY="4">
      <BrushControls />
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          Summary type
        </Text>
        <RadioGroup.Root
          size="1"
          value={inspectorMode}
          onValueChange={value => setInspectorMode(value as SummaryType)}
        >
          <Flex direction="row" align="center" gapX="3" gapY="1" wrap="wrap">
            {availableModes.map(({value, label}) => (
              <RadioGroup.Item key={value} value={value}>
                {label}
              </RadioGroup.Item>
            ))}
          </Flex>
        </RadioGroup.Root>
      </Flex>
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          Columns
        </Text>
        <Flex direction="row" className="w-full" wrap="wrap" gap="1">
          <ResponsiveCheckboxCards
            defaultValue={[]}
            value={activeColumns}
            gap="1"
            size="1"
            onValueChange={value => {
              setActiveColumns([...value, ...totalColumns]);
            }}
            id="inspector-columns"
          >
            {columnList.map(f => (
              <CardCheckbox value={f.column} key={f.column} label={f.label} />
            ))}
          </ResponsiveCheckboxCards>
        </Flex>
      </Flex>
    </Flex>
  );
};
