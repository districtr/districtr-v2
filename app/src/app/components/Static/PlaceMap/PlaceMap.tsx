'use client';
import React, {useState} from 'react';
import {useParentSize} from '@visx/responsive';
import {Box, Flex, Heading} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import PlaceMapSvg from './PlaceMapSvg';
import { useMapStore } from '@/app/store/mapStore';

export const background = '#FFFFFF';
export const FILL_COLOR = '#0099cd';
export const HOVER_COLOR = '#006b9c';

export const colors: string[] = ['#744DCA', '#3D009C', '#9020FF', '#C630FD'];

export const PlaceMap: React.FC<{width: number; height: number}> = ({width, height}) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const mapViews = useMapStore(state => state.mapViews);
  console.log(mapViews);
  const hoveredTitleCase = hovered
    ?.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  const router = useRouter();

  return width < 10 ? null : (
    <Flex direction="column" align="center" justify={'center'}>
      <Heading
        size={'5'}
        className="text-center border-b-[1px] border-b-blue-500 w-content mx-auto"
      >
        {!hoveredTitleCase ? 'Click on a state to view its districts' : hoveredTitleCase}
      </Heading>
      <PlaceMapSvg
        width={width}
        height={height}
        onHover={setHovered}
        onClick={name => router.push(`/place/${name}`)}
      />
    </Flex>
  );
};

export const ResponsivePlaceMap: React.FC = () => {
  const {parentRef, width, height} = useParentSize();

  return (
    <Box
      className="size-full"
      ref={parentRef}
      pt={{
        initial: '4',
        md: '4',
      }}
      overflow={'hidden'}
      height={{
        initial: '30vh',
        md: '60vh',
      }}
    >
      <PlaceMap width={width} height={height} />
    </Box>
  );
};
