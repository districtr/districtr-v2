'use client';
import {Box, Flex, Table, Text} from '@radix-ui/themes';
import {thumbnailUrl} from '@/app/utils/api/thumbnailUrl';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {useRouter} from 'next/navigation';
import {NsfwShield} from '@/app/components/Shared/NsfwShield';

const FALLBACK_IMAGE = '/home-megaphone-square.png';
const FALLBACK_IMAGE_URL =
  typeof window !== 'undefined' ? new URL(FALLBACK_IMAGE, window.location.origin).toString() : '';

// The shield wraps the link (not the reverse) so "Show anyway" never navigates.
export const PlanCard = ({plan}: {plan: MinPublicDocument}) => {
  return (
    <NsfwShield nsfw={!!plan.nsfw}>
      <a href={`/map/${plan.public_id}`}>
        <Flex
          direction="column"
          gap="4"
          className="h-full bg-gray-50 rounded-xl shadow-sm hover:shadow-xl
    hover:bg-blue-50 hover:cursor-pointer hover:scale-105 transition-all duration-300"
        >
          <Box
            className="w-full relative overflow-hidden aspect-video border-2 border-b-0 border-gray-50 bg-white"
            style={{
              backgroundImage: `url(${thumbnailUrl(plan.public_id)}), url(${FALLBACK_IMAGE_URL})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          ></Box>
          <Box px="4" py="2">
            <Flex direction="column" gap="2">
              {plan.public_id && <Text size="1">Map ID:{plan.public_id}</Text>}
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
              {!!plan.map_metadata?.tags?.length && (
                <Text size="2" color="gray">
                  {plan.map_metadata.tags.join(', ')}
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
    </NsfwShield>
  );
};

const HIDDEN = '(sensitive content hidden)';

/** nsfw rows blur the thumbnail and replace text cells, like CommentRow. */
export const PlanTableRow = ({plan}: {plan: MinPublicDocument}) => {
  const router = useRouter();
  return (
    // align-middle: the thumbnail cell is taller than one text line, and
    // top-aligned text reads as misaligned beside it.
    <Table.Row
      onClick={() => router.push(`/map/${plan.public_id}`)}
      className="[&>td]:align-middle"
    >
      <Table.Cell>{plan.public_id}</Table.Cell>
      <Table.Cell>
        <Box
          className={`w-full relative overflow-hidden aspect-video border-2 border-gray-50 bg-white size-8${plan.nsfw ? ' blur-md' : ''}`}
          style={{
            backgroundImage: `url(${thumbnailUrl(plan.public_id)}), url(${FALLBACK_IMAGE_URL})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        ></Box>
      </Table.Cell>
      <Table.Cell>{plan.nsfw ? HIDDEN : (plan.map_metadata?.name ?? '')}</Table.Cell>
      <Table.Cell>{plan.map_module ?? ''}</Table.Cell>
      <Table.Cell>{plan.nsfw ? '' : (plan.map_metadata?.description ?? '')}</Table.Cell>
      <Table.Cell>{plan.nsfw ? '' : (plan.map_metadata?.tags?.join(', ') ?? '')}</Table.Cell>
      <Table.Cell>{new Date(plan.updated_at).toLocaleDateString() ?? ''}</Table.Cell>
    </Table.Row>
  );
};
