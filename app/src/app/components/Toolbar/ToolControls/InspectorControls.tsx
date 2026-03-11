import {useTooltipStore} from '@store/tooltipStore';
import {CONFIG_BY_COLUMN_SET} from '@store/demography/evaluationConfig';
import {demographyCache} from '@utils/demography/demographyCache';
import {COLUMN_SETS, TOTAL_COLUMNS} from '@/app/constants/demography';
import {useEffect} from 'react';
import {Flex, Heading, Button, CheckboxCards, Text} from '@radix-ui/themes';
import {BrushControls} from '@components/Toolbar/ToolControls/BrushControls';
import {styled} from '@stitches/react';

const StyledCheckboxCards = styled(CheckboxCards.Root, {
  display: 'grid',
  gap: 'var(--space-1)',
  gridTemplateColumns: 'repeat(1, 1fr)',
  '@container (min-width: 240px)': {
    gridTemplateColumns: 'repeat(2, 1fr)',
  },
  '@container (min-width: 360px)': {
    gridTemplateColumns: 'repeat(3, 1fr)',
  },
  '@container (min-width: 600px)': {
    display: 'flex',
    flexWrap: 'wrap',
  },
});

export const InspectorControls = () => {
  const inspectorMode = useTooltipStore(state => state.inspectorMode);
  const activeColumns = useTooltipStore(state => state.activeColumns);
  const setInspectorMode = useTooltipStore(state => state.setInspectorMode);
  const setActiveColumns = useTooltipStore(state => state.setActiveColumns);

  const columnList = CONFIG_BY_COLUMN_SET[inspectorMode]
    .filter(f => demographyCache.availableColumns.includes(f.sourceCol ?? f.column))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalCol = TOTAL_COLUMNS[inspectorMode];
  const totalColumn = totalCol ? [totalCol] : [];

  useEffect(() => {
    setActiveColumns([...totalColumn, ...columnList.map(f => f.column)]);
  }, [inspectorMode, setActiveColumns]);

  return (
    <Flex direction="column">
      <BrushControls />
      <Heading as="h3" size="3">
        Inspector mode
      </Heading>
      <Flex direction="row" className="" wrap="wrap" gap="1">
        <Button
          variant="soft"
          color={inspectorMode === COLUMN_SETS.VAP ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode(COLUMN_SETS.VAP)}
        >
          Voting Age Population
        </Button>
        <Button
          variant="soft"
          color={inspectorMode === COLUMN_SETS.TOTPOP ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode(COLUMN_SETS.TOTPOP)}
        >
          Total Population
        </Button>
        <Button
          variant="soft"
          color={inspectorMode === COLUMN_SETS.VOTERHISTORY ? 'blue' : 'gray'}
          radius="none"
          onClick={() => setInspectorMode(COLUMN_SETS.VOTERHISTORY)}
        >
          Voter History
        </Button>
      </Flex>
      <Flex direction="column" py="4" gap="2">
        <Heading as="h3" size="3">
          Inspector columns
        </Heading>
        <Flex direction="row" className="" wrap="wrap" gap="1">
          <StyledCheckboxCards
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
              <CheckboxCards.Item value={f.column} key={f.column}>
                <Flex direction="column" width="100%">
                  <Text>{f.label}</Text>
                </Flex>
              </CheckboxCards.Item>
            ))}
          </StyledCheckboxCards>
        </Flex>
      </Flex>
    </Flex>
  );
};
