/**
 * CommentGallery - CMS-embeddable component for displaying public comments
 *
 * This component can be inserted into CMS pages via the TipTap editor.
 * It supports filtering by IDs, tags, location, and configurable display options.
 * Optional filter controls allow visitors to search and filter comments.
 *
 * Uses the generic Gallery component for consistent pagination and view modes.
 */
'use client';
import React, {useState, useCallback, useEffect, useMemo} from 'react';
import {Gallery} from '@/app/components/Static/Gallery';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Table,
  Text,
  TextField,
} from '@radix-ui/themes';
import {Cross1Icon, MagnifyingGlassIcon, MixerHorizontalIcon} from '@radix-ui/react-icons';
import {
  getPublicComments,
  type CommentFilters,
  type CommentListing,
} from '@/app/utils/api/apiHandlers/getComments';
import {CommentCard, CommentRow} from './CommentGalleryRenderers';

/** Debounce delay in milliseconds */
const DEBOUNCE_DELAY = 300;

/** Type for user-controlled filter state */
type UserFilters = {
  search: string;
  hasMap: boolean | undefined;
  place: string;
  state: string;
  zipCode: string;
  tags: string[];
};

/** Initial state for user filters */
const INITIAL_USER_FILTERS: UserFilters = {
  search: '',
  hasMap: undefined,
  place: '',
  state: '',
  zipCode: '',
  tags: [],
};

/** Custom hook for debounced value */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/** Props for CommentGallery - matches attributes defined in CommentGalleryNode */
export interface CommentGalleryProps {
  ids?: number[];
  tags?: string[];
  place?: string;
  state?: string;
  zipCode?: string;
  offset?: number;
  limit?: number;
  title?: string;
  description?: string;
  paginate?: boolean;
  showListView?: boolean;
  showTitles?: boolean;
  showPlaces?: boolean;
  showStates?: boolean;
  showZipCodes?: boolean;
  showCreatedAt?: boolean;
  showIdentifier?: boolean;
  showFilters?: boolean;
  showMaps?: boolean;
}

/** Location filter field configuration */
const LOCATION_FIELDS = [
  {key: 'place' as const, label: 'Place', placeholder: 'City/Place', minWidth: '150px'},
  {key: 'state' as const, label: 'State', placeholder: 'State', minWidth: '100px'},
  {key: 'zipCode' as const, label: 'Zip Code', placeholder: 'Zip', minWidth: '100px'},
];

/** Filter controls component for the gallery */
const FilterControls: React.FC<{
  filters: UserFilters;
  onFilterChange: (key: keyof UserFilters, value: UserFilters[keyof UserFilters]) => void;
  onClearFilters: () => void;
}> = ({filters, onFilterChange, onClearFilters}) => {
  const [tagInput, setTagInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAddTag = () => {
    if (tagInput.trim() && !filters.tags.includes(tagInput.trim())) {
      onFilterChange('tags', [...filters.tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    onFilterChange(
      'tags',
      filters.tags.filter(t => t !== tag)
    );
  };

  const hasActiveFilters =
    filters.search ||
    filters.hasMap !== undefined ||
    filters.place ||
    filters.state ||
    filters.zipCode ||
    filters.tags.length > 0;

  return (
    <Box className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
      {/* Search bar - always visible */}
      <Flex gap="3" align="center" wrap="wrap">
        <TextField.Root
          placeholder="Search comments..."
          value={filters.search}
          onChange={e => onFilterChange('search', e.target.value)}
          className="flex-1 min-w-[200px]"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
          {filters.search && (
            <TextField.Slot>
              <Button
                variant="ghost"
                size="1"
                onClick={() => onFilterChange('search', '')}
                className="cursor-pointer"
              >
                <Cross1Icon />
              </Button>
            </TextField.Slot>
          )}
        </TextField.Root>

        <Button
          variant="soft"
          onClick={() => setIsExpanded(!isExpanded)}
          className="whitespace-nowrap"
        >
          <MixerHorizontalIcon />
          {isExpanded ? 'Hide Filters' : 'More Filters'}
          {hasActiveFilters && !isExpanded && (
            <Box className="w-2 h-2 rounded-full bg-blue-500 ml-1" />
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" color="gray" onClick={onClearFilters} size="2">
            Clear all
          </Button>
        )}
      </Flex>

      {/* Expanded filters */}
      {isExpanded && (
        <Box className="mt-4 pt-4 border-t border-slate-200">
          <Flex gap="4" wrap="wrap">
            {/* Has map filter */}
            <Flex align="center" gap="2" className="min-w-[150px]">
              <Checkbox
                checked={filters.hasMap === true}
                onCheckedChange={checked =>
                  onFilterChange('hasMap', checked ? true : undefined)
                }
              />
              <Text size="2">Has map</Text>
            </Flex>

            {/* Location filters */}
            {LOCATION_FIELDS.map(({key, label, placeholder, minWidth}) => (
              <Box key={key} className="flex-1" style={{minWidth}}>
                <Text as="label" size="1" weight="medium" className="text-slate-600 block mb-1">
                  {label}
                </Text>
                <TextField.Root
                  placeholder={placeholder}
                  value={filters[key]}
                  onChange={e => onFilterChange(key, e.target.value)}
                  size="2"
                />
              </Box>
            ))}
          </Flex>

          {/* Tags filter */}
          <Box className="mt-3">
            <Text as="label" size="1" weight="medium" className="text-slate-600 block mb-1">
              Tags
            </Text>
            <Flex gap="2" align="center">
              <TextField.Root
                placeholder="Add tag..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                size="2"
                className="max-w-[200px]"
              >
                <TextField.Slot>
                  <Text size="1" color="gray">
                    #
                  </Text>
                </TextField.Slot>
              </TextField.Root>
              <Button variant="soft" size="2" onClick={handleAddTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </Flex>
            {filters.tags.length > 0 && (
              <Flex gap="2" wrap="wrap" className="mt-2">
                {filters.tags.map(tag => (
                  <Box
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-sm cursor-pointer hover:bg-purple-200 transition-colors"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    #{tag}
                    <Cross1Icon className="w-3 h-3" />
                  </Box>
                ))}
              </Flex>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export const CommentGallery: React.FC<CommentGalleryProps> = ({
  ids,
  tags: initialTags,
  place: initialPlace,
  state: initialState,
  zipCode: initialZipCode,
  offset,
  limit,
  title,
  description,
  showListView,
  showTitles,
  showPlaces,
  showStates,
  showZipCodes,
  showCreatedAt,
  showIdentifier,
  showFilters = false,
  showMaps = true,
}) => {
  // User-controlled filters (when showFilters is enabled)
  // This state updates immediately for responsive UI
  const [userFilters, setUserFilters] = useState<UserFilters>(INITIAL_USER_FILTERS);

  // Debounced filters for API queries - only updates after user stops typing
  const debouncedUserFilters = useDebouncedValue(userFilters, DEBOUNCE_DELAY);

  const handleFilterChange = useCallback(
    (key: string, value: string | boolean | undefined | string[]) => {
      setUserFilters(prev => ({...prev, [key]: value}));
    },
    []
  );

  const handleClearFilters = useCallback(() => {
    setUserFilters(INITIAL_USER_FILTERS);
  }, []);

  // Combine initial (CMS-set) filters with debounced user-controlled filters
  // Using useMemo to avoid unnecessary recalculations
  const filters: CommentFilters = useMemo(
    () => ({
      ids: ids,
      // Merge initial tags with user-added tags
      tags:
        initialTags || debouncedUserFilters.tags.length > 0
          ? [...(initialTags ?? []), ...debouncedUserFilters.tags]
          : undefined,
      // User filters override initial values if set, otherwise use initial
      place: debouncedUserFilters.place || initialPlace,
      state: debouncedUserFilters.state || initialState,
      zipCode: debouncedUserFilters.zipCode || initialZipCode,
      offset: offset,
      limit: limit,
      search: debouncedUserFilters.search || undefined,
      hasMap: debouncedUserFilters.hasMap,
    }),
    [
      ids,
      initialTags,
      debouncedUserFilters,
      initialPlace,
      initialState,
      initialZipCode,
      offset,
      limit,
    ]
  );

  // Display options for card and row renderers
  const displayOptions = useMemo(
    () => ({
      showIdentifier,
      showTitles,
      showPlaces,
      showStates,
      showZipCodes,
      showCreatedAt,
      showMaps,
    }),
    [showIdentifier, showTitles, showPlaces, showStates, showZipCodes, showCreatedAt, showMaps]
  );

  return (
    <Box>
      {showFilters && (
        <FilterControls
          filters={userFilters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
        />
      )}
      <Gallery<
        CommentListing,
        CommentFilters,
        {ok: true; response: CommentListing[]} | {ok: false; error: {detail: string}}
      >
        title={title}
        description={description}
        paginate
        limit={limit ?? 10}
        showListView={showListView}
        filters={filters}
        queryKey={['comments', debouncedUserFilters]}
        queryFunction={({filters, limit, offset}) =>
          getPublicComments({...filters, limit, offset})
        }
        selectItems={data => (data?.ok ? data.response : [])}
        isError={data => !Boolean(data?.ok)}
        errorMessage={data => (data?.ok ? null : data?.error?.detail)}
        gridRenderer={(comment, i) => (
          <CommentCard key={i} comment={comment} options={displayOptions} />
        )}
        tableHeader={
          <>
            {showTitles && <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>}
            {showIdentifier && <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>}
            {showPlaces && <Table.ColumnHeaderCell>Place</Table.ColumnHeaderCell>}
            {showStates && <Table.ColumnHeaderCell>State</Table.ColumnHeaderCell>}
            {showZipCodes && <Table.ColumnHeaderCell>Zip</Table.ColumnHeaderCell>}
            {showMaps && <Table.ColumnHeaderCell>Map</Table.ColumnHeaderCell>}
            {showCreatedAt && <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>}
          </>
        }
        tableRowRenderer={(comment, i) => (
          <CommentRow key={i} comment={comment} options={displayOptions} />
        )}
        emptyState={
          <Flex direction="column" align="center" gap="2" className="py-8">
            <Text size="3" color="gray">
              No comments found
            </Text>
            {showFilters && userFilters.search && (
              <Text size="2" color="gray">
                Try adjusting your search or filters
              </Text>
            )}
          </Flex>
        }
      />
    </Box>
  );
};
