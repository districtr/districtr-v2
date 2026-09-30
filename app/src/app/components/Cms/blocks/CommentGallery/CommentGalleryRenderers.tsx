/**
 * Renderers for CommentGallery grid and table views.
 *
 * These components are passed to the generic Gallery as gridRenderer and tableRowRenderer.
 * Every field shows when the submission has a value for it.
 */
'use client';
import {Box, Button, Flex, Heading, Table, Text} from '@radix-ui/themes';
import {PersonIcon, CalendarIcon, GlobeIcon, ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {flagSubmission, type SubmissionListing} from '@/app/utils/api/apiHandlers/getSubmissions';
import {formatDistanceToNow} from 'date-fns';
import {useState} from 'react';
import {NsfwShield} from '@/app/components/Shared/NsfwShield';

interface CommentRenderersProps {
  comment: SubmissionListing;
}

/** Formats commenter's first and last name, with fallback to 'Anonymous' */
const getCommenterName = (comment: SubmissionListing) => {
  const parts = [comment.first_name, comment.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Anonymous';
};

/** Formats location string from place, state, and zip */
const getLocationString = (comment: SubmissionListing) => {
  const parts = [];
  if (comment.place) parts.push(comment.place);
  if (comment.state) parts.push(comment.state);
  if (comment.zip_code) parts.push(comment.zip_code);
  return parts.join(', ');
};

/** Report button: flags a submission for moderator review. */
const ReportButton: React.FC<{submissionId: number}> = ({submissionId}) => {
  const [reported, setReported] = useState(false);
  return (
    <Button
      size="1"
      variant="ghost"
      color="gray"
      disabled={reported}
      title="Report this submission for moderator review"
      onClick={async e => {
        e.stopPropagation();
        const response = await flagSubmission(submissionId);
        if (response.ok) setReported(true);
      }}
    >
      <ExclamationTriangleIcon className="w-3 h-3" />
      {reported ? 'Reported' : 'Report'}
    </Button>
  );
};

/** Map link component for comments with associated maps */
const MapLink: React.FC<{publicId: number}> = ({publicId}) => (
  <a
    href={`/map/${publicId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-sm font-medium transition-colors"
    onClick={e => e.stopPropagation()}
  >
    <GlobeIcon className="w-4 h-4" />
    View Map
  </a>
);

/** Card renderer for grid view - displays comment with optional metadata */
export const CommentCard: React.FC<CommentRenderersProps> = ({comment}) => {
  const hasLocation = !!(comment.place || comment.state || comment.zip_code);

  return (
    <NsfwShield nsfw={comment.nsfw}>
      <Box className="flex flex-col h-full bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        {/* Header */}
        <Box className="px-4 pt-4 pb-3 border-b border-slate-100 bg-slate-50">
          <Flex align="start" justify="between" gap="3">
            <Flex direction="column" gap="1" className="flex-1 min-w-0">
              {comment.title && (
                <Heading
                  size="2"
                  as="h3"
                  className="text-slate-800 line-clamp-2 pt-0 mt-0"
                  title={comment.title}
                >
                  {comment.title}
                </Heading>
              )}
              <Flex direction="row" justify="between" align="center" gap="1.5">
                <Flex align="center" gap="1.5">
                  <PersonIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <Text size="1" color="gray" className="truncate">
                    {getCommenterName(comment)}
                  </Text>
                </Flex>
                {comment.created_at && (
                  <Flex align="center" gap="1" className="flex-shrink-0">
                    <CalendarIcon className="w-3 h-3 text-slate-400" />
                    <Text size="1" color="gray" className="whitespace-nowrap">
                      {formatDistanceToNow(new Date(comment.created_at), {addSuffix: true})}
                    </Text>
                  </Flex>
                )}
              </Flex>
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

          {/* Map, Report */}
          <Flex wrap="wrap" gap="2" align="center">
            {comment.public_id && <MapLink publicId={comment.public_id} />}
            <ReportButton submissionId={comment.id} />
          </Flex>
        </Box>
      </Box>
    </NsfwShield>
  );
};

/** Row renderer for table/list view - displays comment fields as table cells.
 * nsfw rows blur every free-text cell until the reader opts in, the same
 * decision and reach as the card's NsfwShield. */
export const CommentRow: React.FC<CommentRenderersProps> = ({comment}) => {
  const [revealed, setRevealed] = useState(false);
  const blurred = comment.nsfw && !revealed;
  const blur = blurred ? ' blur-sm select-none' : '';
  const text = (value: string | null | undefined) => value || '—';
  return (
    <Table.Row className="hover:bg-slate-50 transition-colors">
      <Table.Cell>
        <Text weight="medium" className={`line-clamp-1${blur}`} aria-hidden={blurred}>
          {text(comment.title)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {blurred && (
          <Button size="1" variant="soft" color="gray" onClick={() => setRevealed(true)}>
            Show sensitive content
          </Button>
        )}
        <Text size="2" className={`line-clamp-3 whitespace-pre-line${blur}`} aria-hidden={blurred}>
          {text(comment.comment)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Flex align="center" gap="1.5">
          <PersonIcon className="w-3.5 h-3.5 text-slate-400" />
          <Text size="2" className={blur} aria-hidden={blurred}>
            {getCommenterName(comment)}
          </Text>
        </Flex>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray" className={blur} aria-hidden={blurred}>
          {text(comment.place)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray" className={blur} aria-hidden={blurred}>
          {text(comment.state)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray" className={blur} aria-hidden={blurred}>
          {text(comment.zip_code)}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {comment.public_id ? (
          <MapLink publicId={comment.public_id} />
        ) : (
          <Text size="2" color="gray">
            —
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray">
          {formatDistanceToNow(new Date(comment.created_at), {addSuffix: true})}
        </Text>
      </Table.Cell>
    </Table.Row>
  );
};
