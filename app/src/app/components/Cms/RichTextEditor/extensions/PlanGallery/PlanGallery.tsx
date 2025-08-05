'use client';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {Box, Button, Flex, Grid, Text} from '@radix-ui/themes';
import React, {useState} from 'react';
import {QueryClientProvider, useQuery} from '@tanstack/react-query';
import {getPlans} from '@/app/utils/api/apiHandlers/getPlans';
import {queryClient} from '@/app/utils/api/queryClient';
import {CDN_URL} from '@/app/utils/api/constants';

type PlanGalleryProps = {
  ids?: Array<number>;
  tags?: string[];
  title: string;
  description: string;
  paginate?: boolean;
  limit?: number;
};

export const PlanGalleryInner = ({
  ids,
  tags,
  title,
  description,
  paginate,
  limit = 12,
}: PlanGalleryProps) => {
  const [page, setPage] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(+limit);
  const {data: plans} = useQuery({
    queryKey: ['plans', ids, tags, page],
    queryFn: () => getPlans({ids, tags, limit: displayLimit, offset: page * displayLimit}),
  });
  const showPagination = paginate && plans && (plans.length === displayLimit || page > 0);

  return (
    <>
      <ContentSection title={title}>
        <Text size="5">{description}</Text>
      </ContentSection>
      <Grid
        columns={{
          initial: '1',
          xs: '1',
          sm: '2',
          md: '3',
          lg: '4',
          xl: '6',
        }}
        gap="4"
      >
        {plans?.map((plan, i) => <PlanCard plan={plan} key={i} />)}
      </Grid>
      {showPagination && (
        <Flex justify="start" mt="4" gap="4">
          <Button onClick={() => setPage(page - 1)} disabled={page === 0}>
            Previous
          </Button>
          <Button onClick={() => setPage(page + 1)} disabled={plans.length < displayLimit}>
            Next
          </Button>
        </Flex>
      )}
    </>
  );
};

export const PlanGallery = (props: PlanGalleryProps) => {
  return (
    <QueryClientProvider client={queryClient}>
      <PlanGalleryInner {...props} />
    </QueryClientProvider>
  );
};

export const PlanCard = ({plan}: {plan: MinPublicDocument}) => {
  return (
    <a href={`/map/${plan.public_id}`}>
      <Flex
        direction="column"
        gap="4"
        className="h-full bg-gray-50 rounded-xl shadow-sm hover:shadow-xl
    hover:bg-blue-50 hover:cursor-pointer hover:scale-105 transition-all duration-300"
      >
        {/* box with a 16:9 aspect ratio and overflow hidden */}
        <Box
          className="w-full relative overflow-hidden aspect-video border-2 border-b-0 border-gray-50 bg-white"
          style={{
            backgroundImage: `url(${CDN_URL}/thumbnails/${plan.public_id}.png), url(/home-megaphone-square.png)`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        ></Box>
        <Box px="4" py="2">
          <Flex direction="column" gap="2">
            {plan.map_metadata?.name && <Text size="5">{plan.map_metadata?.name}</Text>}
            {plan.map_module && (
              <Text size="2" color="gray">
                {plan.map_module}
              </Text>
            )}
            {plan.map_metadata?.description && (
              <Text size="2" color="gray">
                {plan.map_metadata?.description}
              </Text>
            )}
            {plan.updated_at && (
              <Text size="2" color="gray">
                Last updated: {new Date(plan.updated_at).toLocaleDateString()}
              </Text>
            )}
          </Flex>
        </Box>
      </Flex>
    </a>
  );
};
