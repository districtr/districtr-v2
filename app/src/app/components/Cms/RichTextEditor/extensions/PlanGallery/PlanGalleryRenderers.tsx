'use client';
import {Badge, Box, Flex, Table, Text} from '@radix-ui/themes';
import {thumbnailUrl} from '@/app/utils/api/thumbnailUrl';
import {MinPublicDocument} from '@utils/api/apiHandlers/types';
import {useRouter} from 'next/navigation';
import {DRAFT_STATUS_COLORS, DRAFT_STATUS_TEXT} from '@constants/document/draftStatus';

export type PlanFlags = {
  showThumbnails?: boolean;
  showTitles?: boolean;
  showDescriptions?: boolean;
  showUpdatedAt?: boolean;
  showTags?: boolean;
  showModule?: boolean;
  /** Quiet per-plan completion-status badge, for mixed-status galleries. */
  showStatus?: boolean;
};

const StatusBadge = ({plan}: {plan: MinPublicDocument}) => {
  const status = plan.map_metadata?.draft_status;
  if (!status) return null;
  return (
    <Badge color={DRAFT_STATUS_COLORS[status]} variant="soft" size="1" className="w-fit">
      {DRAFT_STATUS_TEXT[status]}
    </Badge>
  );
};

const FALLBACK_IMAGE = '/home-megaphone-square.png';
const FALLBACK_IMAGE_URL =
  typeof window !== 'undefined' ? new URL(FALLBACK_IMAGE, window.location.origin).toString() : '';

export const PlanCard = ({plan, ...flags}: {plan: MinPublicDocument} & PlanFlags) => {
  return (
    <a href={`/map/${plan.public_id}`}>
      <Flex
        direction="column"
        gap="4"
        className="h-full bg-gray-50 rounded-xl shadow-sm hover:shadow-xl
    hover:bg-blue-50 hover:cursor-pointer hover:scale-105 transition-all duration-300"
      >
        {!!flags.showThumbnails && (
          <Box
            className="w-full relative overflow-hidden aspect-video border-2 border-b-0 border-gray-50 bg-white"
            style={{
              backgroundImage: `url(${thumbnailUrl(plan.public_id)}), url(${FALLBACK_IMAGE_URL})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          ></Box>
        )}
        <Box px="4" py="2">
          <Flex direction="column" gap="2">
            {plan.public_id && <Text size="1">Map ID:{plan.public_id}</Text>}
            {!!flags.showStatus && <StatusBadge plan={plan} />}
            {!!flags.showTitles && plan.map_metadata?.name && (
              <Text size="5">{plan.map_metadata?.name}</Text>
            )}
            {!!flags.showModule && plan.map_module && (
              <Text size="2" color="gray">
                {plan.map_module}
              </Text>
            )}
            {!!flags.showDescriptions && plan.map_metadata?.description && (
              <Text size="2" color="gray">
                {plan.map_metadata?.description}
              </Text>
            )}
            {!!flags.showTags && !!plan.map_metadata?.tags?.length && (
              <Text size="2" color="gray">
                {plan.map_metadata.tags.join(', ')}
              </Text>
            )}
            {!!flags.showUpdatedAt && plan.updated_at && (
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

export const PlanTableRow = ({plan, ...flags}: {plan: MinPublicDocument} & PlanFlags) => {
  const router = useRouter();
  return (
    // align-middle: the thumbnail cell is taller than one text line, and
    // top-aligned text reads as misaligned beside it.
    <Table.Row
      onClick={() => router.push(`/map/${plan.public_id}`)}
      className="[&>td]:align-middle"
    >
      <Table.Cell>{plan.public_id}</Table.Cell>
      {!!flags.showThumbnails && (
        <Table.Cell>
          <Box
            className="w-full relative overflow-hidden aspect-video border-2 border-gray-50 bg-white size-8"
            style={{
              backgroundImage: `url(${thumbnailUrl(plan.public_id)}), url(${FALLBACK_IMAGE_URL})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          ></Box>
        </Table.Cell>
      )}
      {!!flags.showTitles && <Table.Cell>{plan.map_metadata?.name ?? ''}</Table.Cell>}
      {!!flags.showModule && <Table.Cell>{plan.map_module ?? ''}</Table.Cell>}
      {!!flags.showDescriptions && <Table.Cell>{plan.map_metadata?.description ?? ''}</Table.Cell>}
      {!!flags.showTags && <Table.Cell>{plan.map_metadata?.tags?.join(', ') ?? ''}</Table.Cell>}
      {!!flags.showUpdatedAt && (
        <Table.Cell>{new Date(plan.updated_at).toLocaleDateString() ?? ''}</Table.Cell>
      )}
      {!!flags.showStatus && (
        <Table.Cell>
          <StatusBadge plan={plan} />
        </Table.Cell>
      )}
    </Table.Row>
  );
};
