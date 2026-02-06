import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {AllCmsContent, AllCmsLists, CmsContentTypes} from '@/app/utils/api/cms';
import {LANG_MAPPING} from '@/app/utils/language';
import {
  CaretSortIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  EyeOpenIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from '@radix-ui/react-icons';
import {Badge, Flex, Heading, IconButton, Text, TextField, Tooltip} from '@radix-ui/themes';
import React, {useMemo, useState} from 'react';

const ITEMS_PER_PAGE = 10;

// ── Types ──────────────────────────────────────────────────────────────────────

type SortField = 'name' | 'updated';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'published' | 'edited' | 'draft';

interface SlugGroup {
  slug: string;
  title: string;
  items: AllCmsContent[];
  hasPublished: boolean;
  hasDraft: boolean;
  hasNewEdits: boolean;
  contentType: CmsContentTypes;
  updatedAt: string; // latest updated_at across all items in the group
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function groupBySlug(content: AllCmsLists | null, contentType: CmsContentTypes): SlugGroup[] {
  if (!content || content.length === 0) return [];

  const groups = new Map<string, SlugGroup>();

  for (const item of content) {
    const existing = groups.get(item.slug);
    if (existing) {
      existing.items.push(item);
      if (item.published_content) existing.hasPublished = true;
      if (item.draft_content && !item.published_content) existing.hasDraft = true;
      if (item.published_content && item.draft_content) existing.hasNewEdits = true;
      if (item.updated_at > existing.updatedAt) existing.updatedAt = item.updated_at;
    } else {
      groups.set(item.slug, {
        slug: item.slug,
        title: item.draft_content?.title || item.published_content?.title || item.slug,
        items: [item],
        hasPublished: !!item.published_content,
        hasDraft: !!item.draft_content && !item.published_content,
        hasNewEdits: !!item.published_content && !!item.draft_content,
        contentType,
        updatedAt: item.updated_at,
      });
    }
  }

  return Array.from(groups.values());
}

function getGroupStatus(group: SlugGroup): StatusFilter {
  if (group.hasNewEdits) return 'edited';
  if (group.hasPublished) return 'published';
  return 'draft';
}

function getStatusBadge(group: SlugGroup) {
  const status = getGroupStatus(group);
  if (status === 'edited') return <Badge color="blue" size="1">Edited</Badge>;
  if (status === 'published') return <Badge color="green" size="1">Published</Badge>;
  return <Badge color="orange" size="1">Draft</Badge>;
}

function sortGroups(groups: SlugGroup[], field: SortField, dir: SortDir): SlugGroup[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    let cmp: number;
    if (field === 'name') {
      cmp = a.title.localeCompare(b.title);
    } else {
      cmp = a.updatedAt.localeCompare(b.updatedAt);
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function filterGroups(
  groups: SlugGroup[],
  statusFilter: StatusFilter,
  searchQuery: string
): SlugGroup[] {
  let result = groups;

  if (statusFilter !== 'all') {
    result = result.filter(g => getGroupStatus(g) === statusFilter);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter(
      g =>
        g.title.toLowerCase().includes(q) ||
        g.slug.toLowerCase().includes(q)
    );
  }

  return result;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const ContentTypeTab: React.FC<{
  type: CmsContentTypes;
  label: string;
  isActive: boolean;
  count: number;
  onClick: () => void;
}> = ({label, isActive, count, onClick}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`}
  >
    {label}
    {count > 0 && (
      <span
        className={`text-xs px-1.5 py-0.5 rounded-full ${
          isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const SortButton: React.FC<{
  label: string;
  field: SortField;
  activeField: SortField;
  dir: SortDir;
  onToggle: (field: SortField) => void;
}> = ({label, field, activeField, dir, onToggle}) => {
  const isActive = activeField === field;
  return (
    <button
      onClick={() => onToggle(field)}
      className={`flex items-center gap-0.5 px-2 py-1 text-xs rounded transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
      {isActive ? (
        dir === 'asc' ? (
          <ChevronUpIcon className="w-3 h-3" />
        ) : (
          <ChevronDownIcon className="w-3 h-3" />
        )
      ) : (
        <CaretSortIcon className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
};

const StatusFilterButton: React.FC<{
  label: string;
  value: StatusFilter;
  activeValue: StatusFilter;
  onClick: (value: StatusFilter) => void;
  color?: string;
}> = ({label, value, activeValue, onClick, color}) => {
  const isActive = activeValue === value;
  return (
    <button
      onClick={() => onClick(isActive ? 'all' : value)}
      className={`px-2 py-0.5 text-xs rounded-full transition-colors border ${
        isActive
          ? `bg-${color}-50 text-${color}-700 border-${color}-200`
          : 'text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
};

const SlugGroupRow: React.FC<{
  group: SlugGroup;
  isSelected: boolean;
  onSelect: (item: AllCmsContent, type: CmsContentTypes) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
  onPreview: (item: AllCmsContent) => void;
  canPublish: boolean;
}> = ({group, isSelected, onSelect, onDelete, onPublish, onPreview, canPublish}) => {
  const [expanded, setExpanded] = useState(false);
  const hasMultipleLanguages = group.items.length > 1;
  const primaryItem = group.items[0];

  return (
    <div
      className={`border-b border-gray-100 last:border-b-0 ${
        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          className="flex-1 text-left min-w-0"
          onClick={() => onSelect(primaryItem, group.contentType)}
        >
          <Text size="2" weight="medium" className="block truncate">
            {group.title}
          </Text>
          <Flex align="center" gap="1" mt="1">
            {getStatusBadge(group)}
            {hasMultipleLanguages && (
              <Badge color="gray" variant="soft" size="1">
                {group.items.length} lang
              </Badge>
            )}
            {!hasMultipleLanguages && (
              <Text size="1" className="text-gray-400">
                {LANG_MAPPING[primaryItem.language] || primaryItem.language}
              </Text>
            )}
          </Flex>
        </button>
        <Flex gap="1" align="center" className="shrink-0">
          {hasMultipleLanguages && (
            <Tooltip content="Show language variants">
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => setExpanded(!expanded)}
              >
                <DotsHorizontalIcon />
              </IconButton>
            </Tooltip>
          )}
        </Flex>
      </div>
      {expanded && hasMultipleLanguages && (
        <div className="bg-gray-50 border-t border-gray-100">
          {group.items.map(item => (
            <LanguageRow
              key={item.id}
              item={item}
              contentType={group.contentType}
              onSelect={onSelect}
              onDelete={onDelete}
              onPublish={onPublish}
              onPreview={onPreview}
              canPublish={canPublish}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const LanguageRow: React.FC<{
  item: AllCmsContent;
  contentType: CmsContentTypes;
  onSelect: (item: AllCmsContent, type: CmsContentTypes) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
  onPreview: (item: AllCmsContent) => void;
  canPublish: boolean;
}> = ({item, contentType, onSelect, onDelete, onPublish, onPreview, canPublish}) => {
  const statusBadge =
    item.published_content && item.draft_content ? (
      <Badge color="blue" size="1">Edited</Badge>
    ) : item.published_content ? (
      <Badge color="green" size="1">Published</Badge>
    ) : (
      <Badge color="orange" size="1">Draft</Badge>
    );

  return (
    <div className="flex items-center gap-2 px-3 py-2 pl-6 hover:bg-gray-100 border-b border-gray-100 last:border-b-0">
      <button className="flex-1 text-left min-w-0" onClick={() => onSelect(item, contentType)}>
        <Flex align="center" gap="2">
          <Text size="1" weight="medium">
            {LANG_MAPPING[item.language] || item.language}
          </Text>
          {statusBadge}
        </Flex>
      </button>
      <Flex gap="1" className="shrink-0">
        <Tooltip content="Edit">
          <IconButton variant="ghost" size="1" onClick={() => onSelect(item, contentType)}>
            <Pencil1Icon />
          </IconButton>
        </Tooltip>
        {Boolean((item.draft_content || item.published_content)?.body) && (
          <Tooltip content="Preview">
            <IconButton variant="ghost" color="gray" size="1" onClick={() => onPreview(item)}>
              <EyeOpenIcon />
            </IconButton>
          </Tooltip>
        )}
        {canPublish && item.draft_content && (
          <Tooltip content="Publish">
            <IconButton variant="ghost" color="green" size="1" onClick={() => onPublish(item.id)}>
              <UploadIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip content="Delete">
          <IconButton variant="ghost" color="red" size="1" onClick={() => onDelete(item.id)}>
            <TrashIcon />
          </IconButton>
        </Tooltip>
      </Flex>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────

export const ContentList: React.FC = () => {
  const allContent = useCmsFormStore(state => state.allContent);
  const contentType = useCmsFormStore(state => state.contentType);
  const session = useCmsFormStore(state => state.session);
  const editingContent = useCmsFormStore(state => state.editingContent);
  const handlePublish = useCmsFormStore(state => state.handlePublish);
  const handleEdit = useCmsFormStore(state => state.handleEdit);
  const handleDelete = useCmsFormStore(state => state.handleDelete);
  const setPreviewData = useCmsFormStore(state => state.setPreviewData);
  const switchContentType = useCmsFormStore(state => state.switchContentType);
  const cancelEdit = useCmsFormStore(state => state.cancelEdit);

  const canPublish = session?.tokenSet?.scope?.includes('update:publish') ?? false;

  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const activeType = contentType || 'tags';

  const tagsGroups = useMemo(() => groupBySlug(allContent.tags, 'tags'), [allContent.tags]);
  const placesGroups = useMemo(
    () => groupBySlug(allContent.places, 'places'),
    [allContent.places]
  );

  const rawGroups = activeType === 'tags' ? tagsGroups : placesGroups;

  // Apply filter, sort, then paginate
  const filteredGroups = useMemo(
    () => filterGroups(rawGroups, statusFilter, searchQuery),
    [rawGroups, statusFilter, searchQuery]
  );
  const sortedGroups = useMemo(
    () => sortGroups(filteredGroups, sortField, sortDir),
    [filteredGroups, sortField, sortDir]
  );

  const totalPages = Math.ceil(sortedGroups.length / ITEMS_PER_PAGE);
  const paginatedGroups = sortedGroups.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE
  );

  const hasActiveFilters = statusFilter !== 'all' || searchQuery.trim().length > 0;
  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (searchQuery.trim().length > 0 ? 1 : 0);

  const handleTypeSwitch = (type: CmsContentTypes) => {
    setPage(0);
    switchContentType(type);
  };

  const handleSortToggle = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(0);
  };

  const handleStatusFilter = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(0);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setPage(0);
  };

  const handleSelect = (item: AllCmsContent, type: CmsContentTypes) => {
    handleEdit(item, type);
  };

  const handlePreview = (item: AllCmsContent) => {
    const content = item.draft_content || item.published_content;
    if (content?.body) {
      setPreviewData({title: content.title || '', body: content.body});
    }
  };

  const handleNewContent = () => {
    cancelEdit();
  };

  const selectedSlug = editingContent?.content?.slug;

  return (
    <Flex
      direction="column"
      className="bg-white border border-gray-200 rounded-lg shadow-sm w-full h-full overflow-hidden"
    >
      {/* Header */}
      <Flex direction="column" className="border-b border-gray-200">
        <Flex align="center" justify="between" className="px-3 py-3">
          <Heading size="3" as="h3">
            Content
          </Heading>
          <Flex gap="1">
            <Tooltip content={showFilters ? 'Hide filters' : 'Show filters'}>
              <IconButton
                variant={showFilters || hasActiveFilters ? 'soft' : 'ghost'}
                color={hasActiveFilters ? 'blue' : 'gray'}
                size="1"
                onClick={() => setShowFilters(v => !v)}
              >
                <MixerHorizontalIcon />
              </IconButton>
            </Tooltip>
            <Tooltip content="New entry">
              <IconButton variant="soft" size="1" onClick={handleNewContent}>
                <PlusIcon />
              </IconButton>
            </Tooltip>
          </Flex>
        </Flex>

        {/* Content type tabs */}
        <Flex gap="1" className="px-3 pb-2">
          <ContentTypeTab
            type="tags"
            label="Tags"
            isActive={activeType === 'tags'}
            count={allContent.tags?.length ?? 0}
            onClick={() => handleTypeSwitch('tags')}
          />
          <ContentTypeTab
            type="places"
            label="Places"
            isActive={activeType === 'places'}
            count={allContent.places?.length ?? 0}
            onClick={() => handleTypeSwitch('places')}
          />
        </Flex>
      </Flex>

      {/* Filter / sort controls */}
      {showFilters && (
        <Flex direction="column" gap="2" className="px-3 py-2 border-b border-gray-200 bg-gray-50">
          {/* Search */}
          <TextField.Root
            size="1"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search by title or slug..."
          >
            <TextField.Slot>
              <MagnifyingGlassIcon className="w-3 h-3" />
            </TextField.Slot>
            {searchQuery && (
              <TextField.Slot>
                <IconButton
                  variant="ghost"
                  color="gray"
                  size="1"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(0);
                  }}
                >
                  <Cross2Icon className="w-3 h-3" />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>

          {/* Sort */}
          <Flex direction="column" gap="1">
            <Text size="1" className="text-gray-500">
              Sort by
            </Text>
            <Flex gap="1">
              <SortButton
                label="Name"
                field="name"
                activeField={sortField}
                dir={sortDir}
                onToggle={handleSortToggle}
              />
              <SortButton
                label="Updated"
                field="updated"
                activeField={sortField}
                dir={sortDir}
                onToggle={handleSortToggle}
              />
            </Flex>
          </Flex>

          {/* Status filter */}
          <Flex direction="column" gap="1">
            <Text size="1" className="text-gray-500">
              Status
            </Text>
            <Flex gap="1" wrap="wrap">
              <StatusFilterButton
                label="Published"
                value="published"
                activeValue={statusFilter}
                onClick={handleStatusFilter}
                color="green"
              />
              <StatusFilterButton
                label="Has Edits"
                value="edited"
                activeValue={statusFilter}
                onClick={handleStatusFilter}
                color="blue"
              />
              <StatusFilterButton
                label="Draft"
                value="draft"
                activeValue={statusFilter}
                onClick={handleStatusFilter}
                color="orange"
              />
            </Flex>
          </Flex>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-gray-700 self-start"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </Flex>
      )}

      {/* Active filters indicator (when panel is closed) */}
      {!showFilters && hasActiveFilters && (
        <Flex
          align="center"
          justify="between"
          className="px-3 py-1.5 border-b border-gray-200 bg-blue-50"
        >
          <Text size="1" className="text-blue-700">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
            {filteredGroups.length !== rawGroups.length &&
              ` \u00B7 ${filteredGroups.length} of ${rawGroups.length}`}
          </Text>
          <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800">
            Clear
          </button>
        </Flex>
      )}

      {/* Content list */}
      <div className="flex-1 overflow-y-auto">
        {paginatedGroups.length === 0 ? (
          <Flex align="center" justify="center" py="8" direction="column" gap="2">
            <Text size="2" className="text-gray-400">
              {hasActiveFilters
                ? 'No matching content'
                : `No ${activeType} content yet`}
            </Text>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
          </Flex>
        ) : (
          paginatedGroups.map(group => (
            <SlugGroupRow
              key={group.slug}
              group={group}
              isSelected={selectedSlug === group.slug}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onPublish={handlePublish}
              onPreview={handlePreview}
              canPublish={canPublish}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex align="center" justify="between" className="border-t border-gray-200 px-3 py-2">
          <Text size="1" className="text-gray-500">
            {sortedGroups.length} group{sortedGroups.length !== 1 ? 's' : ''}
          </Text>
          <Flex align="center" gap="1">
            <IconButton
              variant="ghost"
              size="1"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeftIcon />
            </IconButton>
            <Text size="1" className="text-gray-500 px-1">
              {page + 1} / {totalPages}
            </Text>
            <IconButton
              variant="ghost"
              size="1"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRightIcon />
            </IconButton>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};
