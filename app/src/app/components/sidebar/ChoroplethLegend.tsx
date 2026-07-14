'use client';
import React from 'react';
import {Box, Flex, Text} from '@radix-ui/themes';
import {LegendLabel, LegendThreshold} from '@visx/legend';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {isCoalitionVariable} from '@/app/utils/demography/coalition';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {DEMOGRAPHIC_MODES} from '@constants/map/demographicMode';

/**
 * Color legend for the active choropleth scale, self-contained on the
 * demography/map-controls stores so it can render in the sidebar MapPanel
 * and in the mobile on-map overlay alike. Null when no scale is active.
 */
export const ChoroplethLegend: React.FC = () => {
  const scale = useDemographyStore(state => state.scale);
  const variable = useDemographyStore(state => state.variable);
  const variant = useDemographyStore(state => state.variant);
  const isOverlay =
    useMapControlsStore(state => state.mapOptions.demographicDisplayMode) ===
    DEMOGRAPHIC_MODES.OVERLAY;
  const overlayOpacity = useMapControlsStore(state => state.mapOptions.overlayOpacity);

  const mapVariableConfig = Object.values(choroplethMapVariables)
    .flat()
    .find(f => f.value === variable);
  const canBePercent =
    mapVariableConfig?.variants?.includes('percent') || isCoalitionVariable(variable);
  const labelFormat =
    canBePercent && variant === 'percent' ? NUMBER_FORMATS.PERCENT : NUMBER_FORMATS.COMPACT;
  const colors = scale?.range() || [];

  if (!scale) return null;

  if ('invertExtent' in scale) {
    return (
      <Flex direction={'row'} justify="center" gapX="2">
        <LegendThreshold
          scale={scale}
          labelFormat={label => formatNumber(label as number, labelFormat)}
          className="w-full"
        >
          {labels => {
            return (
              <Flex direction={'column'} width="100%">
                <Flex direction="row" width="100%">
                  {labels.map((label, i) => (
                    <Box
                      width={'100%'}
                      style={{
                        display: 'inline-block',
                        height: '1rem',
                        backgroundColor: colors[i] as string,
                        opacity: isOverlay ? overlayOpacity : 0.9,
                      }}
                      key={`legend-bar-${i}`}
                    ></Box>
                  ))}
                </Flex>

                <Flex
                  direction="row"
                  width={`${100 - 100 / colors.length / 2}%`}
                  style={{paddingLeft: `${100 / colors.length / 2}%`}}
                >
                  {labels.slice(1).map((label, i) => (
                    <LegendLabel align="center" key={`legend-label-text-${i}`}>
                      {formatNumber(label.datum as number, labelFormat)}
                    </LegendLabel>
                  ))}
                </Flex>
              </Flex>
            );
          }}
        </LegendThreshold>
      </Flex>
    );
  }

  if (mapVariableConfig?.fixedScale && mapVariableConfig.customLegendLabels) {
    return (
      <Flex direction={'column'} justify="center" gapX="2" width="100%">
        <LinearGradient
          colors={mapVariableConfig.fixedScale
            .domain()
            .map((d: number) => mapVariableConfig.fixedScale!(d))}
          numTicks={mapVariableConfig.customLegendLabels.length}
        />
        <Flex direction={'row'} width="100%" justify="between">
          {mapVariableConfig.customLegendLabels.map((label: string, i: number) => (
            <Text key={`legend-label-${i}`}>{label}</Text>
          ))}
        </Flex>
      </Flex>
    );
  }

  return null;
};

const LinearGradient: React.FC<{
  colors: string[];
  numTicks: number;
}> = ({colors, numTicks}) => {
  return (
    <Box width="100%" height="1rem" position="relative" px="2">
      <Box
        width="100%"
        height="100%"
        position="absolute"
        top="0"
        left="0"
        style={{
          background: `linear-gradient(to right, ${colors.join(',')})`,
        }}
      />
      <Flex
        direction="row"
        width="100%"
        height="100%"
        position="absolute"
        top="0"
        left="0"
        justify="between"
      >
        {Array.from({length: numTicks}).map((_, i) => (
          <Box key={`legend-bar-${i}`} height="100%" className="border-r border-black" />
        ))}
      </Flex>
    </Box>
  );
};
