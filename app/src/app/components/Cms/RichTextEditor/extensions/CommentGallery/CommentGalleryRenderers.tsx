/**
 * Renderers for CommentGallery grid and table views.
 *
 * These components are passed to the generic Gallery as gridRenderer and tableRowRenderer.
 * They handle conditional display of fields based on the options prop.
 */
'use client';
import {Badge, Box, Flex, Heading, Table, Text} from '@radix-ui/themes';
import {PersonIcon, CalendarIcon, GlobeIcon} from '@radix-ui/react-icons';
import {type CommentListing} from '@/app/utils/api/apiHandlers/getComments';
import {formatDistanceToNow} from 'date-fns';

/** Display options passed from CommentGallery to control which fields are shown */
interface CommentRenderersProps {
  comment: CommentListing;
  options: {
    showIdentifier?: boolean;
    showTitles?: boolean;
    showPlaces?: boolean;
    showStates?: boolean;
    showZipCodes?: boolean;
    showCreatedAt?: boolean;
    showMaps?: boolean;
  };
}

/** Formats commenter's first and last name, with fallback to 'Anonymous' */
const getCommenterName = (comment: CommentListing) => {
  const parts = [comment.first_name, comment.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Anonymous';
};

/** Formats location string from place, state, and zip */
const getLocationString = (comment: CommentListing) => {
  const parts = [];
  if (comment.place) parts.push(comment.place);
  if (comment.state) parts.push(comment.state);
  if (comment.zip_code) parts.push(comment.zip_code);
  return parts.join(', ');
};

/** Map link component for comments with associated maps */
const MapLink: React.FC<{publicId: number; zone?: number | null}> = ({publicId, zone}) => (
  <a
    href={`/map/${publicId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-sm font-medium transition-colors"
    onClick={e => e.stopPropagation()}
  >
    <GlobeIcon className="w-4 h-4" />
    View Map
    {zone !== null && zone !== undefined && (
      <Badge size="1" color="blue" variant="soft">
        Zone {zone}
      </Badge>
    )}
  </a>
);

/** Card renderer for grid view - displays comment with optional metadata */
export const CommentCard: React.FC<CommentRenderersProps> = ({comment, options}) => {
  const hasLocation =
    (options.showPlaces && comment.place) ||
    (options.showStates && comment.state) ||
    (options.showZipCodes && comment.zip_code);

  return (
    <Box className="flex flex-col h-full bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <Box className="px-4 pt-4 pb-3 border-b border-slate-100 bg-slate-50">
        <Flex align="start" justify="between" gap="3">
          <Flex direction="column" gap="1" className="flex-1 min-w-0">
            {options.showTitles && comment.title && (
              <Heading size="2" as="h3" className="text-slate-800 line-clamp-2 pt-0 mt-0" title={comment.title}>
                {comment.title}
              </Heading>
            )}
            {!!(options.showIdentifier || options.showCreatedAt) && (
              <Flex direction="row" justify="between" align="center" gap="1.5">
                {options.showIdentifier && (
                  <Flex align="center" gap="1.5">
                    <PersonIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <Text size="1" color="gray" className="truncate">
                      {getCommenterName(comment)}
                    </Text>
                  </Flex>
                )}
                {options.showCreatedAt && comment.created_at && (
                  <Flex align="center" gap="1" className="flex-shrink-0">
                    <CalendarIcon className="w-3 h-3 text-slate-400" />
                    <Text size="1" color="gray" className="whitespace-nowrap">
                      {formatDistanceToNow(new Date(comment.created_at), {addSuffix: true})}
                    </Text>
                  </Flex>
                )}
              </Flex>
            )}
          </Flex>
        </Flex>
      </Box>

      {/* Content */}
      <Box className="px-4 py-3 flex-1">
        <Text size="2" className="text-slate-600 whitespace-pre-line line-clamp-4">
          {comment.comment}
        </Text>
      </Box>

      {/* Footer */}
      <Box className="px-4 pb-4 pt-2 mt-auto">
        {/* Location */}
        {hasLocation && (
          <Text size="1" color="gray" className="block mb-2">
            📍 {getLocationString(comment)}
          </Text>
        )}

        {/* Tags and Map */}
        <Flex wrap="wrap" gap="2" align="center">
          {comment.tags?.map(tag => (
            <Badge key={tag} size="1" variant="surface" color="purple" className="cursor-default">
              #{tag}
            </Badge>
          ))}
          {options.showMaps && comment.public_id && (
            <MapLink publicId={comment.public_id} zone={comment.zone} />
          )}
        </Flex>
      </Box>
    </Box>
  );
};

/** Row renderer for table/list view - displays comment fields as table cells */
export const CommentRow: React.FC<CommentRenderersProps> = ({comment, options}) => (
  <Table.Row className="hover:bg-slate-50 transition-colors">
    {options.showTitles && (
      <Table.Cell>
        <Text weight="medium" className="line-clamp-1">
          {comment.title}
        </Text>
      </Table.Cell>
    )}
    {options.showIdentifier && (
      <Table.Cell>
        <Flex align="center" gap="1.5">
          <PersonIcon className="w-3.5 h-3.5 text-slate-400" />
          <Text size="2">{getCommenterName(comment)}</Text>
        </Flex>
      </Table.Cell>
    )}
    {options.showPlaces && (
      <Table.Cell>
        <Text size="2" color="gray">
          {comment.place || '—'}
        </Text>
      </Table.Cell>
    )}
    {options.showStates && (
      <Table.Cell>
        <Text size="2" color="gray">
          {comment.state || '—'}
        </Text>
      </Table.Cell>
    )}
    {options.showZipCodes && (
      <Table.Cell>
        <Text size="2" color="gray">
          {comment.zip_code || '—'}
        </Text>
      </Table.Cell>
    )}
    {options.showMaps && (
      <Table.Cell>
        {comment.public_id ? (
          <MapLink publicId={comment.public_id} zone={comment.zone} />
        ) : (
          <Text size="2" color="gray">
            —
          </Text>
        )}
      </Table.Cell>
    )}
    {options.showCreatedAt && (
      <Table.Cell>
        <Text size="2" color="gray">
          {formatDistanceToNow(new Date(comment.created_at), {addSuffix: true})}
        </Text>
      </Table.Cell>
    )}
  </Table.Row>
);
