'use client';
import React, {useEffect, useState} from 'react';
import {Flex, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {DOT_DENSITY_PALETTE} from '@constants/demography/dotDensity';
import {gridLevelForZoom, peoplePerDotForLevel} from '@/app/utils/dotDensity/tileMath';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';

/** Category swatches plus the zoom-dependent people-per-dot value. */
export const DotDensityLegend: React.FC = () => {
  const getMapRef = useMapStore(state => state.getMapRef);
  const [peoplePerDot, setPeoplePerDot] = useState<number | null>(null);

  useEffect(() => {
    const map = getMapRef();
    if (!map) return;
    const update = () => setPeoplePerDot(peoplePerDotForLevel(gridLevelForZoom(map.getZoom())));
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [getMapRef]);

  return (
    <Flex direction="column" gapY="1" pt="2">
      <Flex direction="row" gapX="3" wrap="wrap">
        {DOT_DENSITY_PALETTE.map(({label, hex}) => (
          <Flex key={label} direction="row" gapX="1" align="center">
            <span
              style={{
                width: '0.75rem',
                height: '0.75rem',
                borderRadius: '50%',
                backgroundColor: hex,
                display: 'inline-block',
              }}
            />
            <Text size="2">{label}</Text>
          </Flex>
        ))}
      </Flex>
      {peoplePerDot !== null && (
        <Text size="2" align="center">
          1 dot = {formatNumber(peoplePerDot, NUMBER_FORMATS.COMPACT) ?? peoplePerDot}{' '}
          {peoplePerDot === 1 ? 'person' : 'people'}
        </Text>
      )}
    </Flex>
  );
};
