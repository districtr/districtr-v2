'use client';
import React from 'react';
import {AlbersUsa} from '@visx/geo';
import stateAbbrs from './usa-abbr.json';
import {Text} from '@radix-ui/themes';
import {usePlaceMapStore, FeatureShape} from './utils';

export const background = '#FFFFFF';
export const FILL_COLOR = '#0099cd';
export const HOVER_COLOR = '#006b9c';

const PlaceMapSvg: React.FC<{
  width: number;
  height: number;
  onHover: (hovered: string | null) => void;
  onClick: (name: string) => void;
}> = ({width, height, onHover, onClick}) => {
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = (width + height) / 1.55;
  const unitedStates = usePlaceMapStore(state => state.data);
  const getData = usePlaceMapStore(state => state.getData);
  if (!unitedStates) {
    getData();
    return <Text>Loading...</Text>;
  }
  return (
    <svg width={width} height={height}>
      <AlbersUsa<FeatureShape>
        data={unitedStates}
        scale={scale}
        translate={[centerX, centerY - 25]}
      >
        {({features}) =>
          features.map(({feature, path}, i) => {
            // @ts-ignore
            const name: string = stateAbbrs[feature.id];

            return (
              <path
                key={`map-feature-${i}`}
                d={path || ''}
                className={`transition-all cursor-pointer fill-[#0099cd] hover:fill-[#006b9c]`}
                stroke={background}
                strokeWidth={1}
                onMouseEnter={() => onHover(name)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onClick(name)}
              />
            );
          })
        }
      </AlbersUsa>
    </svg>
  );
};

export default React.memo(PlaceMapSvg);
