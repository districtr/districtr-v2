'use client';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {
  CoalitionUniverse,
  COALITION_GROUPS,
  getCoalitionGroupLabel,
  getCoalitionLabel,
} from '@/app/utils/demography/coalition';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useChartStore} from '@/app/store/chartStore';
import {formatNumber} from '@/app/utils/numbers';
import {Badge, Box, Button, Checkbox, Flex, Text} from '@radix-ui/themes';

type CoalitionBuilderProps = {
  summaryType: CoalitionUniverse;
};

export const CoalitionBuilder: React.FC<CoalitionBuilderProps> = ({summaryType}) => {
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);
  const setCoalitionGroups = useDemographyStore(state => state.setCoalitionGroups);
  useDemographyStore(state => state.coalitionHash);
  useDemographyStore(state => state.dataHash);
  useChartStore(state => state.dataUpdateHash);

  const stats = demographyCache.getCoalitionUniverseStats(summaryType);
  const selectedSet = new Set(coalitionGroups);
  const availableSet = new Set(stats.availableGroups);
  const availableGroups = COALITION_GROUPS.filter(group => availableSet.has(group.key));

  const coalitionLabel = getCoalitionLabel({
    selectedGroups: coalitionGroups,
    availableColumns: demographyCache.availableColumns,
    universe: summaryType,
  });

  const toggleGroup = (group: (typeof COALITION_GROUPS)[number]['key']) => {
    if (selectedSet.has(group)) {
      void setCoalitionGroups(coalitionGroups.filter(entry => entry !== group));
      return;
    }
    void setCoalitionGroups([...coalitionGroups, group]);
  };

  const handleSelectAll = () => {
    void setCoalitionGroups(availableGroups.map(group => group.key));
  };

  const handleClearAll = () => {
    void setCoalitionGroups([]);
  };

  return (
    <Box className="rounded-md border border-gray-200 p-3">
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Text size="2" weight="bold">
          Coalition Builder
        </Text>
        <Badge color={coalitionGroups.length ? 'blue' : 'gray'}>
          {coalitionGroups.length} selected
        </Badge>
      </Flex>
      <Text size="1" color="gray">
        {coalitionLabel}
      </Text>
      <Flex gap="2" py="2" wrap="wrap">
        <Button
          size="1"
          variant="soft"
          onClick={handleSelectAll}
          disabled={!availableGroups.length || coalitionGroups.length === availableGroups.length}
        >
          Select All Available
        </Button>
        <Button size="1" variant="outline" color="gray" onClick={handleClearAll}>
          Clear
        </Button>
      </Flex>
      <Flex direction="row" wrap="wrap" gap="3" py="1">
        {COALITION_GROUPS.map(group => {
          const available = availableSet.has(group.key);
          return (
            <Text
              as="label"
              key={group.key}
              className={available ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
            >
              <Flex align="center" gap="1">
                <Checkbox
                  checked={selectedSet.has(group.key)}
                  disabled={!available}
                  onCheckedChange={() => toggleGroup(group.key)}
                />
                {group.label}
              </Flex>
            </Text>
          );
        })}
      </Flex>
      {!availableGroups.length && (
        <Text size="1" color="orange">
          No coalition categories are available for this universe.
        </Text>
      )}
      <Flex direction="row" wrap="wrap" gap="3">
        <Text size="1">
          Universe total: <b>{formatNumber(stats.universeTotal, 'string')}</b>
        </Text>
        <Text size="1">
          Coalition total: <b>{formatNumber(stats.coalitionTotal, 'string')}</b>
        </Text>
        <Text size="1">
          Coalition share:{' '}
          <b>
            {Number.isFinite(stats.coalitionPct)
              ? formatNumber(stats.coalitionPct, 'percent')
              : '--'}
          </b>
        </Text>
      </Flex>
      {!!stats.missingGroups.length && (
        <Text size="1" color="orange">
          Selected unavailable categories are ignored in this universe:{' '}
          {stats.missingGroups.map(getCoalitionGroupLabel).join(', ')}
        </Text>
      )}
    </Box>
  );
};
