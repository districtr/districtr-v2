'use client';
import {Card, Flex, Grid, Heading, Spinner, Text} from '@radix-ui/themes';
import {ArrowRightIcon, Component1Icon, LayersIcon, PersonIcon} from '@radix-ui/react-icons';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {sanitizeCommunityMaps} from '@/app/utils/communities';
import {useCreateMapDocument} from './CreateButton';
import {ImportBlockAssignments} from './ImportBlockAssignments';

const MapStartCard: React.FC<{
  view: Partial<DistrictrMap>;
  isCommunity: boolean;
}> = ({view, isCommunity}) => {
  const {createPlan, isCreating} = useCreateMapDocument(view, isCommunity);
  const outcome = isCommunity
    ? 'Draw and describe your communities'
    : view.num_districts
      ? `Draw ${view.num_districts} districts`
      : 'Draw your own districts';
  const Icon = isCommunity ? PersonIcon : Component1Icon;
  const badgeClasses = isCommunity
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-indigo-100 text-indigo-700';
  const arrowClasses = isCommunity ? 'text-emerald-700' : 'text-indigo-700';
  const surfaceClasses = isCommunity
    ? 'bg-emerald-50 hover:bg-emerald-100'
    : 'bg-indigo-50 hover:bg-indigo-100';

  return (
    <Card asChild>
      <button
        onClick={createPlan}
        disabled={isCreating}
        aria-label={`Start a new ${isCommunity ? 'community map' : 'district plan'}: ${view.name}`}
        className={`cursor-pointer text-left transition-shadow hover:shadow-md disabled:cursor-wait ${surfaceClasses}`}
      >
        <Flex align="center" gap="3">
          <Flex
            align="center"
            justify="center"
            flexShrink="0"
            className={`size-9 rounded-full ${badgeClasses}`}
          >
            <Icon />
          </Flex>
          <Flex direction="column" className="min-w-0 grow">
            <Text weight="medium" className="capitalize" truncate>
              {view.name}
            </Text>
            <Text size="1" color="gray">
              {outcome}
            </Text>
          </Flex>
          {isCreating ? (
            <Spinner size="1" className="shrink-0" />
          ) : (
            <ArrowRightIcon className={`shrink-0 ${arrowClasses}`} aria-hidden />
          )}
        </Flex>
      </button>
    </Card>
  );
};

const CardGrid: React.FC<{children: React.ReactNode}> = ({children}) => (
  <Grid
    gap="2"
    columns={{
      initial: '1',
      md: '2',
      lg: '3',
    }}
  >
    {children}
  </Grid>
);

export const PlaceMapGrid: React.FC<{maps: Partial<DistrictrMap>[]}> = ({maps}) => {
  const communityMaps = sanitizeCommunityMaps(maps);

  return (
    <Flex direction="column" gap="5">
      <section>
        <Flex justify="between" align="start" gap="3" wrap="wrap" mb="2">
          <Flex direction="column">
            <Heading as="h3" size="3" mb="1">
              District plans
            </Heading>
            <Text as="p" size="2" color="gray">
              Start from a blank map and divide it into districts.
            </Text>
          </Flex>
          <ImportBlockAssignments />
        </Flex>
        <CardGrid>
          {maps.map((view, i) => (
            <MapStartCard key={i} view={view} isCommunity={false} />
          ))}
        </CardGrid>
      </section>
      {communityMaps.length > 0 && (
        <section>
          <Heading as="h3" size="3" mb="1">
            Community maps
          </Heading>
          <Text as="p" size="2" color="gray" mb="2">
            No district lines — outline the places that matter to your community and tell their
            story.
          </Text>
          <CardGrid>
            {communityMaps.map((view, i) => (
              <MapStartCard key={i} view={view} isCommunity />
            ))}
          </CardGrid>
        </section>
      )}
    </Flex>
  );
};
