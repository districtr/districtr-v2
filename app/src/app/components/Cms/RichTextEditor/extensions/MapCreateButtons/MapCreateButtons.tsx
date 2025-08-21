import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {Box, Flex} from '@radix-ui/themes';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import Image from 'next/image';

export interface MapCreateButtonsProps {
  views: Array<Pick<DistrictrMap, 'name' | 'districtr_map_slug'>>;
  type: 'simple' | 'megaphone';
}
export const MapCreateButtons = ({views, type}: MapCreateButtonsProps) => {
  switch (type) {
    case 'simple':
      return (
        <Flex direction="row" gap="2">
          {views.map(view => (
            <CreateButton key={view.districtr_map_slug} view={view} />
          ))}
        </Flex>
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

          <Box className="relative z-10 text-center max-w-2xl mx-auto px-4">
            {views.map(view => (
              <CreateButton
                key={view.districtr_map_slug}
                view={view}
                extraClasses="bg-districtrBlue text-white text-xl px-8 py-3 rounded-md font-bold hover:bg-blue-700 transition-colors cursor-pointer m-2"
              />
            ))}
          </Box>
        </Flex>
      );
    default:
      return null;
  }
};
