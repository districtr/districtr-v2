import {useTooltipStore} from '@store/tooltipStore';
import {CONFIG_BY_COLUMN_SET} from '@store/demography/evaluationConfig';
import {demographyService} from '@/app/utils/demography/demographyService';
import {useEffect} from 'react';
import {Flex, Heading, Button} from '@radix-ui/themes';
import {BrushControls} from '@components/Toolbar/ToolControls/BrushControls';
import {CardCheckbox, ResponsiveCheckboxCards} from '@/app/components/Shared/CardCheckbox';

export const InspectorControls = () => {
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const setInspectorMode = useTooltipStore(state => state.setInspectorMode);
  const setActiveColumns = useTooltipStore(state => state.setActiveColumns);

  const columnList = CONFIG_BY_COLUMN_SET[inspectorMode]
    .filter(f => demographyService.availableColumns.includes(f.sourceCol ?? f.column))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalColumn = {
    VAP: ['total_vap_20'],
    TOTPOP: ['total_pop_20'],
    VOTERHISTORY: [],
  }[inspectorMode];

  useEffect(() => {
    setActiveColumns([...totalColumn, ...columnList.map(f => f.column)]);
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
          color={inspectorMode === 'VAP' ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode('VAP')}
        >
          Voting Age Population
        </Button>
        <Button
          variant="soft"
          color={inspectorMode === 'TOTPOP' ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode('TOTPOP')}
        >
          Total Population
        </Button>
        <Button
          variant="soft"
          color={inspectorMode === 'VOTERHISTORY' ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode('VOTERHISTORY')}
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
              setActiveColumns([...value, ...totalColumn]);
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
