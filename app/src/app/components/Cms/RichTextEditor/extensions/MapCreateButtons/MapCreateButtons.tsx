import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {Box, Flex} from '@radix-ui/themes';
import {CardGrid, MapStartCard} from '@/app/components/Static/Interactions/PlaceMapGrid';
import Image from 'next/image';

export interface MapCreateButtonsProps {
  views: Array<Pick<DistrictrMap, 'name' | 'districtr_map_slug'>>;
  type: 'simple' | 'megaphone';
}

// Both variants render the same MapStartCard used on place pages, so map
// entry points look identical wherever they appear.
export const MapCreateButtons = ({views, type}: MapCreateButtonsProps) => {
  switch (type) {
    case 'simple':
      return (
        <CardGrid>
          {views.map(view => (
            <MapStartCard key={view.districtr_map_slug} view={view} isCommunity={false} />
          ))}
        </CardGrid>
      );
    case 'megaphone':
      return (
        <Flex
          direction="column"
          align="center"
          justify="center"
          className="relative w-full py-16 overflow-hidden bg-districtrLightBlue rounded-xl my-4"
        >
          <Box className="absolute inset-0 z-0 opacity-100 transform rotate-25 m-[-10%]">
            <Image
              src="/home-megaphone.png"
              alt="Megaphone background"
              fill
              style={{objectFit: 'contain'}}
            />
          </Box>

          <Box className="relative z-10 w-full max-w-2xl mx-auto px-4">
            <Flex direction="column" gap="2">
              {views.map(view => (
                <MapStartCard key={view.districtr_map_slug} view={view} isCommunity={false} />
              ))}
            </Flex>
          </Box>
        </Flex>
      );
    default:
      return null;
  }
};
