'use client';
import React from 'react';
import {Box, Flex, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {getCoalitionLabel} from '@/app/utils/demography/coalition';
import {isCoalitionVariable} from '@/app/utils/demography/coalition';
import {demographyService} from '@/app/utils/demography/demographyService';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';
import {COALITION_UNIVERSES} from '@constants/demography/summary';
import {ChoroplethLegend} from '../sidebar/ChoroplethLegend';
import {DotDensityLegend} from '../sidebar/DotDensityLegend';

/**
 * Floating on-map legend for small screens, where the sidebar (and its
 * legend) is tucked behind the mobile data panel. Renders whenever a
 * demographic display mode is active; hidden at the md breakpoint and up.
 */
export const MobileMapLegend: React.FC = () => {
  const displayMode = useMapControlsStore(state => state.mapOptions.demographicDisplayMode);
  const variable = useDemographyStore(state => state.variable);
  useDemographyStore(state => state.coalitionHash);
  const coalitionGroups = useDemographyStore(state => state.coalitionGroups);

  if (!displayMode) return null;
  const isDotDensity = displayMode === DEMOGRAPHIC_MODES.DOT_DENSITY;

  const variableLabel = isCoalitionVariable(variable)
    ? getCoalitionLabel({
        selectedGroups: coalitionGroups,
        availableColumns: demographyService.availableColumns,
        universe: variable.includes('vap')
          ? COALITION_UNIVERSES.VAP
          : COALITION_UNIVERSES.TOTPOP,
      })
    : Object.values(choroplethMapVariables)
        .flat()
        .find(f => f.value === variable)?.label;

  return (
    <Box
      display={{initial: 'block', md: 'none'}}
      position="absolute"
      bottom="4"
      left="2"
      className="z-10 rounded-md bg-white/90 shadow-md p-2 max-w-[75%] min-w-[50%]"
    >
      <Flex direction="column" gapY="1">
        {isDotDensity ? (
          <DotDensityLegend />
        ) : (
          <>
            {!!variableLabel && (
              <Text size="1" weight="medium">
                {variableLabel}
              </Text>
            )}
            <ChoroplethLegend />
          </>
        )}
      </Flex>
    </Box>
  );
};
