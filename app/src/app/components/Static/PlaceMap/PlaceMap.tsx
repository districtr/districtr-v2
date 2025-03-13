'use client';
import React, {useState} from 'react';
import {AlbersUsa} from '@visx/geo';
import {geoCentroid} from '@visx/vendor/d3-geo';
import * as topojson from 'topojson-client';
import topology from './usa-topo.json';
import stateAbbrs from './usa-abbr.json';
import {useParentSize} from '@visx/responsive';
import {Box, Heading} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';

export const background = '#FFFFFF';
export const FILL_COLOR = '#0099cd';
export const HOVER_COLOR = '#006b9c';
export type GeoAlbersUsaProps = {
  width: number;
  height: number;
};

interface FeatureShape {
  type: 'Feature';
  id: string;
  geometry: {coordinates: [number, number][][]; type: 'Polygon'};
  properties: {name: string};
}

// @ts-expect-error
const {features: unitedStates} = topojson.feature(topology, topology.objects.states) as {
  type: 'FeatureCollection';
  features: FeatureShape[];
};

export const colors: string[] = ['#744DCA', '#3D009C', '#9020FF', '#C630FD'];

export const PlaceMap: React.FC<any> = ({width, height}: GeoAlbersUsaProps) => {
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = (width + height) / 1.55;
  const [hovered, setHovered] = useState<string | null>(null);
  const router = useRouter();

  return width < 10 ? null : (
    <>
      <Heading size={'5'} className="text-center border-b-[1px] border-b-blue-500 w-content mx-auto">
        {!hovered ? 'Click on a state to view its districts' : hovered}
      </Heading>
      <svg width={width} height={height}>
        <AlbersUsa<FeatureShape>
          data={unitedStates}
          scale={scale}
          translate={[centerX, centerY - 25]}
        >
          {({features}) =>
            features.map(({feature, path, projection}, i) => {
              const name: string = stateAbbrs[feature.id];

              return (
                <path
                  key={`map-feature-${i}`}
                  d={path || ''}
                  className="transition-all cursor-pointer"
                  fill={name === hovered ? HOVER_COLOR : FILL_COLOR}
                  stroke={background}
                  strokeWidth={1}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => router.push(`/place/${name}`)}
                />
              );
            })
          }
        </AlbersUsa>
      </svg>
    </>
  );
};

export const ResponsivePlaceMap: React.FC = () => {
  const {parentRef, width, height} = useParentSize();

  return (
    <Box className="size-full" ref={parentRef}>
      <PlaceMap width={width} height={height} />
    </Box>
  );
};
