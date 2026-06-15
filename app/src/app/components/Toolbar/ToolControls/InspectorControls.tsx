import {useTooltipStore} from '@store/tooltipStore';
import {CONFIG_BY_COLUMN_SET} from '@store/demography/evaluationConfig';
import {demographyService} from '@/app/utils/demography/demographyService';
import {useEffect} from 'react';
import {Flex, Heading, Button} from '@radix-ui/themes';
import {BrushControls} from '@components/Toolbar/ToolControls/BrushControls';
import {CardCheckbox, ResponsiveCheckboxCards} from '@/app/components/Shared/CardCheckbox';
import {SUMMARY_TYPES, TOTAL_COLUMN} from '@constants/demography/summary';

export const InspectorControls = () => {
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const setInspectorMode = useTooltipStore(state => state.setInspectorMode);
  const setActiveColumns = useTooltipStore(state => state.setActiveColumns);

  const columnList = CONFIG_BY_COLUMN_SET[inspectorMode]
    .filter(f => demographyService.availableColumns.includes(f.sourceCol ?? f.column))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalColumn = TOTAL_COLUMN[inspectorMode];
  const totalColumns = totalColumn ? [totalColumn] : [];

  useEffect(() => {
    setActiveColumns([...totalColumns, ...columnList.map(f => f.column)]);
  }, [inspectorMode, setActiveColumns]);

  return (
    <Flex direction="column">
      <BrushControls />
      <Heading as="h3" size="3">
        Inspector mode
      </Heading>
      <Flex direction="row" className="w-full" wrap="wrap" gap="1">
        <Button
          variant="soft"
          color={inspectorMode === SUMMARY_TYPES.VAP ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode(SUMMARY_TYPES.VAP)}
        >
          Voting Age Population
        </Button>
        <Button
          variant="soft"
          color={inspectorMode === SUMMARY_TYPES.TOTPOP ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode(SUMMARY_TYPES.TOTPOP)}
        >
          Total Population
        </Button>
        <Button
          variant="soft"
          color={inspectorMode === SUMMARY_TYPES.VOTERHISTORY ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode(SUMMARY_TYPES.VOTERHISTORY)}
        >
          Voter History
        </Button>
      </Flex>
      <Flex direction="column" py="4" gap="2">
        <Heading as="h3" size="3">
          Inspector columns
        </Heading>
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
