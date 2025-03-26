'use client';
import React from 'react';
import {AlbersUsa} from '@visx/geo';
import stateAbbrs from './usa-abbr.json';
import {Text} from '@radix-ui/themes';
import {usePlaceMapStore, FeatureShape} from './utils';

export const background = '#FFFFFF';
export const FILL_COLOR = '#0099cd';
export const HOVER_COLOR = '#006b9c';

export const PlaceMapSvg: React.FC<{
  width: number;
  height: number;
  onHover: (hovered: {name: string; abbr: string} | null) => void;
  onClick: (name: string) => void;
}> = ({width, height, onHover, onClick}) => {
  const centerX = width / 2;
  const centerY = width < 400 ? height / 3 : height / 2;
  const scale = Math.min(width * 1.3, height * 1.7);
  const unitedStates = usePlaceMapStore(state => state.data);
  const getData = usePlaceMapStore(state => state.getData);
  if (!unitedStates) {
    getData();
    return <Text>Loading...</Text>;
  }
  return (
    <svg width={width} height={height} className="absolute top-0 left-0">
      <AlbersUsa<FeatureShape>
        data={unitedStates}
        scale={scale}
        translate={[centerX, centerY - 25]}
      >
        {({features}) =>
          features.map(({feature, path}, i) => {
            // @ts-ignore
            const entry = stateAbbrs[feature.id];

            return (
              <path
                key={`map-feature-${i}`}
                d={path || ''}
                className={`transition-all cursor-pointer fill-[#0099cd] hover:fill-[#006b9c]`}
                stroke={background}
                strokeWidth={1}
                onMouseEnter={() => onHover(entry)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onClick(entry.abbr)}
              />
            );
          })
        }
      </AlbersUsa>
    </svg>
  );
};


