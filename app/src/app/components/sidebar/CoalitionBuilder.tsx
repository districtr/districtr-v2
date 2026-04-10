'use client';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import type {CoalitionUniverse} from '@constants/types';
import {
  CoalitionGroupKey,
  COALITION_GROUPS,
  getCoalitionGroupLabel,
} from '@/app/utils/demography/coalition';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useChartStore} from '@/app/store/chartStore';
import {CardCheckbox, ResponsiveCheckboxCards} from '@/app/components/Shared/CardCheckbox';
import {formatNumber} from '@/app/utils/numbers';
import {Box, Callout, Flex, Text} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';

type CoalitionBuilderProps = {
  summaryType: CoalitionUniverse;
};

const COALITION_GROUP_KEYS = new Set(COALITION_GROUPS.map(group => group.key));
const isCoalitionGroupKey = (value: string): value is CoalitionGroupKey =>
  COALITION_GROUP_KEYS.has(value as CoalitionGroupKey);

export const CoalitionBuilder: React.FC<CoalitionBuilderProps> = ({summaryType}) => {
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);
  const setCoalitionGroups = useDemographyStore(state => state.setCoalitionGroups);
  // Subscribe to hashes to re-render when underlying cache data changes
  useDemographyStore(state => state.coalitionHash);
  useDemographyStore(state => state.dataHash);
  useChartStore(state => state.dataUpdateHash);

  const stats = demographyCache.getCoalitionUniverseStats(summaryType, coalitionGroups);
  const availableSet = new Set(stats.availableGroups);
  const handleCoalitionChange = (values: string[]) => {
    const selectedAvailableGroups = values.filter(isCoalitionGroupKey);
    const selectedUnavailableGroups = coalitionGroups.filter(group => !availableSet.has(group));
    const nextGroups = Array.from(
      new Set([...selectedUnavailableGroups, ...selectedAvailableGroups])
    ) as CoalitionGroupKey[];
    void setCoalitionGroups(nextGroups);
  };

  const missingLabels = stats.missingGroups.map(getCoalitionGroupLabel);

  return (
    <Box>
      <ResponsiveCheckboxCards
        value={coalitionGroups}
        gap="1"
        size="1"
        onValueChange={handleCoalitionChange}
        id="coalition-groups"
      >
        {COALITION_GROUPS.map(group => {
          return (
            <CardCheckbox
              key={group.key}
              value={group.key}
              label={group.label}
              disabled={!availableSet.has(group.key)}
            />
          );
        })}
      </ResponsiveCheckboxCards>
      {missingLabels.length > 0 && (
        <Callout.Root size="1" color="amber" mt="2">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>
            {missingLabels.join(', ')} unavailable for {summaryType}
          </Callout.Text>
        </Callout.Root>
      )}
      <Flex direction="row" wrap="wrap" gap="4" pt="3" className="w-full">
        <Box flexGrow="1">
          <Text size="5" weight="bold">
            {formatNumber(stats.universeTotal, 'string')}
          </Text>
          <br />
          <Text size="2" color="gray">
            Statewide total
          </Text>
        </Box>
        <Box flexGrow="1">
          <Text size="5" weight="bold">
            {formatNumber(stats.coalitionTotal, 'string')}
          </Text>
          <br />
          <Text size="2" color="gray">
            Coalition total
          </Text>
        </Box>
        <Box flexGrow="1">
          <Text size="5" weight="bold">
            {Number.isFinite(stats.coalitionPct)
              ? formatNumber(stats.coalitionPct, 'percent')
              : '--'}
          </Text>
          <br />
          <Text size="2" color="gray">
            Coalition share
          </Text>
        </Box>
      </Flex>
    </Box>
  );
};
