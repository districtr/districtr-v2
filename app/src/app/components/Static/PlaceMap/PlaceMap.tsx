'use client';
import React, {useState} from 'react';
import {useParentSize} from '@visx/responsive';
import {Box, Button, Flex, Select} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {PlaceMapSvg} from './PlaceMapSvg';
import Link from 'next/link';
import stateAbbrs from './usa-abbr.json';
import {usePlaceMapStore} from './utils';

export const background = '#FFFFFF';
export const FILL_COLOR = '#0099cd';
export const HOVER_COLOR = '#006b9c';

export const colors: string[] = ['#744DCA', '#3D009C', '#9020FF', '#C630FD'];
export const PlaceSelector: React.FC<{onChange: (abbr: string) => void}> = ({onChange}) => {
  const hovered = usePlaceMapStore(state => state.hovered);
  const mapsBySlug = usePlaceMapStore(state => state.mapsBySlug);
  return (
    <Select.Root size="3" onValueChange={onChange} value="">
      <Select.Trigger
        variant="ghost"
        placeholder={!hovered?.name ? 'Choose a state to redistrict' : hovered.name}
      />
      <Select.Content>
        {Object.values(stateAbbrs)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(place => ({
            ...place,
            slug: place.name.toLowerCase().replaceAll(' ', '-'),
          }))
          .map((place: {name: string; abbr: string; slug: string}, i: number) => (
            <Select.Item value={place.slug} key={i}>
              {place.name}{' '}
              {`${place.name && mapsBySlug?.[place.slug] ? `(${mapsBySlug?.[place.slug]} map${mapsBySlug?.[place.slug] > 1 ? 's' : ''})` : ``}`}
            </Select.Item>
          ))}
      </Select.Content>
    </Select.Root>
  );
};
export const PlaceMap: React.FC<{width: number; height: number}> = ({width, height}) => {
  const setHovered = usePlaceMapStore(state => state.setHovered);
  const router = useRouter();
  const handleRoute = (name: string) =>
    router.push(`/place/${name.toLowerCase().replaceAll(' ', '-')}`);
  return width < 10 ? null : (
    <Flex direction="column" align="center" justify={'center'}>
      <PlaceMapSvg width={width} height={height} onHover={setHovered} onClick={handleRoute} />
      {width > 400 && (
        <Flex direction="column" right="0" bottom="0" position="absolute" gapY="1">
          <Link href="/place/dc" legacyBehavior>
            <Button className="rounded-none" variant="outline">
              Washington, DC
            </Button>
          </Link>
          <Link href="/place/pr" legacyBehavior>
            <Button className="rounded-none" variant="outline">
              Puerto Rico
            </Button>
          </Link>
        </Flex>
      )}
      <PlaceSelector onChange={handleRoute} />
    </Flex>
  );
};

export const ResponsivePlaceMap: React.FC = () => {
  const {parentRef, width, height} = useParentSize();

  return (
    <Box
      className="size-full h-[80vh] lg:h-auto lg:aspect-video relative"
      ref={parentRef}
      pt={{
        initial: '4',
        md: '4',
      }}
      overflow={'hidden'}
    >
      <PlaceMap width={width} height={height} />
    </Box>
  );
};
