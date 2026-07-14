'use client';
import React, {useEffect, useState} from 'react';
import {Flex, Slider, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {
  DOT_DENSITY_FACTOR_MAX,
  DOT_DENSITY_FACTOR_MIN,
  DOT_DENSITY_SIZE_MAX,
  DOT_DENSITY_SIZE_MIN,
} from '@constants/demography/dotDensity';
import {getActiveDotDensityCategories} from '@/app/components/Map/CustomLayers/DotDensityLayer';
import {gridLevelForZoom, peoplePerDotForLevel} from '@/app/utils/dotDensity/tileMath';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';

/**
 * Dot density controls and legend: clickable category swatches (toggle races
 * on/off), a density multiplier slider, and the zoom-dependent
 * people-per-dot value. Categories include the Coalition Builder merge when
 * one is active.
 */
export const DotDensityLegend: React.FC = () => {
  const getMapRef = useMapStore(state => state.getMapRef);
  const disabled = useDemographyStore(state => state.dotDensityDisabled);
  const toggleCategory = useDemographyStore(state => state.toggleDotDensityCategory);
  const densityFactor = useDemographyStore(state => state.dotDensityFactor);
  const setDensityFactor = useDemographyStore(state => state.setDotDensityFactor);
  const dotSize = useDemographyStore(state => state.dotDensitySize);
  const setDotSize = useDemographyStore(state => state.setDotDensitySize);
  // re-derive categories when the variable/coalition changes
  useDemographyStore(state => state.variable);
  useDemographyStore(state => state.coalitionHash);
  const categories = getActiveDotDensityCategories();

  const [basePeoplePerDot, setBasePeoplePerDot] = useState<number | null>(null);
  useEffect(() => {
    const map = getMapRef();
    if (!map) return;
    const update = () =>
      setBasePeoplePerDot(peoplePerDotForLevel(gridLevelForZoom(map.getZoom())));
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [getMapRef]);

  const peoplePerDot =
    basePeoplePerDot !== null ? Math.max(1, Math.round(basePeoplePerDot / densityFactor)) : null;

  return (
    <Flex direction="column" gapY="2" pt="2">
      <Flex direction="row" gapX="3" gapY="1" wrap="wrap">
        {categories.map(({label, hex}) => {
          const isOff = disabled.includes(label);
          return (
            <button
              key={label}
              onClick={() => toggleCategory(label)}
              title={`${isOff ? 'Show' : 'Hide'} ${label} dots`}
              style={{opacity: isOff ? 0.35 : 1}}
              className="cursor-pointer"
            >
              <Flex direction="row" gapX="1" align="center">
                <span
                  style={{
                    width: '0.75rem',
                    height: '0.75rem',
                    borderRadius: '50%',
                    backgroundColor: hex,
                    display: 'inline-block',
                  }}
                />
                <Text size="2" style={{textDecoration: isOff ? 'line-through' : undefined}}>
                  {label}
                </Text>
              </Flex>
            </button>
          );
        })}
      </Flex>
      <Flex direction="row" gapX="2" align="center">
        <Text size="2" className="whitespace-nowrap">
          Density &times;{densityFactor}
        </Text>
        <Slider
          value={[densityFactor]}
          onValueChange={value => setDensityFactor(value[0])}
          min={DOT_DENSITY_FACTOR_MIN}
          max={DOT_DENSITY_FACTOR_MAX}
          step={0.5}
          size="1"
        />
      </Flex>
      <Flex direction="row" gapX="2" align="center">
        <Text size="2" className="whitespace-nowrap">
          Dot size &times;{dotSize}
        </Text>
        <Slider
          value={[dotSize]}
          onValueChange={value => setDotSize(value[0])}
          min={DOT_DENSITY_SIZE_MIN}
          max={DOT_DENSITY_SIZE_MAX}
          step={0.25}
          size="1"
        />
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
