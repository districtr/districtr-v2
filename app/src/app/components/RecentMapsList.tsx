import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  TrashIcon,
  Link2Icon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@radix-ui/react-icons';
import {
  Button,
  Flex,
  Text,
  Badge,
  Box,
  Heading,
  Link,
  Select,
  SegmentedControl,
  IconButton,
  AlertDialog,
  DropdownMenu,
  Tooltip,
  Card,
  ScrollArea,
  TextField,
} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {DocumentObject} from '@utils/api/apiHandlers/types';
import {idb} from '@/app/utils/idb/idb';
import {useUserMaps} from '@/app/hooks/useUserMaps';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_TABS, MAP_TAB_LABELS, MAP_TAB_LABEL_PLURAL, MapTab} from '@constants/document/tabs';
import {routeForTab, mapTabFromMode} from '@constants/document/routes';
import {
  DRAFT_STATUSES,
  DRAFT_STATUS_COLORS,
  DRAFT_STATUS_TEXT,
} from '@constants/document/draftStatus';
import {styled} from '@stitches/react';

const UNKNOWN_MODULE = 'Unknown module';
const getMapModule = (map: DocumentObject) => map.map_module || UNKNOWN_MODULE;

const StyledCard = styled(Card, {
  transition: 'all 150ms',
  variants: {
    active: {
      true: {
        backgroundColor: '#eff6ff !important',
        borderColor: '#bfdbfe !important',
      },
      false: {
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'rgba(239, 246, 255, 0.6) !important',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1) !important',
          borderColor: '#93c5fd !important',
          transform: 'translateY(-1px)',
        },
        '&:hover [data-map-name]': {
          color: '#1d4ed8 !important',
          transition: 'color 150ms',
        },
        '&:hover [data-open-hint]': {
          opacity: 1,
        },
      },
    },
  },
});

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export interface RecentMapsListProps {
  maxHeight?: string;
  onNavigate?: () => void;
  showFilters?: boolean;
  useScrollArea?: boolean;
  pageSize?: number;
  /** Lock the list to a single map type and hide the District/Community switcher. */
  mapType?: MapTab;
}

export const RecentMapsList: React.FC<RecentMapsListProps> = ({
  maxHeight = '55vh',
  onNavigate,
  showFilters = false,
  useScrollArea = true,
  pageSize,
  mapType,
}) => {
  const router = useRouter();
  const mapDocument = useMapStore(store => store.mapDocument);
  const mapMode = useMapControlsStore(store => store.mapMode);
  const [tabState, setTabState] = useState<MapTab>(mapTabFromMode(mapMode));
  // When mapType is provided, the list is locked to that type (no switcher).
  const activeTab = mapType ?? tabState;
  const [updateTrigger, setUpdateTrigger] = useState<string | null | number>(null);
  const {communityMaps, districtMaps, loading} = useUserMaps(updateTrigger);
  const recentMaps = activeTab === MAP_TABS.COMMUNITY ? communityMaps : districtMaps;

  const [textFilter, setTextFilter] = useState('');
  const [debouncedTextFilter, setDebouncedTextFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  useEffect(() => {
    setTabState(mapTabFromMode(mapMode));
  }, [mapMode]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTextFilter(textFilter), 300);
    return () => clearTimeout(timer);
  }, [textFilter]);

  const moduleOptions = useMemo(() => {
    if (!showFilters) return [];
    const modules = Array.from(new Set(recentMaps.map(getMapModule)));
    return modules.sort((a, b) => a.localeCompare(b));
  }, [recentMaps, showFilters]);

  const filteredMaps = useMemo(() => {
    if (!showFilters) return recentMaps;
    const normalizedText = debouncedTextFilter.trim().toLowerCase();
    return recentMaps.filter(map => {
      const name = (map.map_metadata?.name || map.districtr_map_slug || '').toLowerCase();
      const module = getMapModule(map);
      const moduleMatches = moduleFilter === 'all' || module === moduleFilter;
      const textMatches =
        !normalizedText ||
        name.includes(normalizedText) ||
        map.districtr_map_slug.toLowerCase().includes(normalizedText) ||
        module.toLowerCase().includes(normalizedText);
      return moduleMatches && textMatches;
    });
  }, [recentMaps, debouncedTextFilter, moduleFilter, showFilters]);

  const [currentPage, setCurrentPage] = useState(0);

  // Reset page when filters, tab, or data change
  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedTextFilter, moduleFilter, activeTab, filteredMaps.length]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(filteredMaps.length / pageSize)) : 1;
  const safePage = Math.min(currentPage, totalPages - 1);
  const paginatedMaps = pageSize
    ? filteredMaps.slice(safePage * pageSize, (safePage + 1) * pageSize)
    : filteredMaps;

  const clearFilters = () => {
    setTextFilter('');
    setModuleFilter('all');
  };

  const handleMapDocument = useCallback(
    (data: DocumentObject) => {
      const route = routeForTab(activeTab);
      router.push(`/${route}/edit/${data.document_id}`);
      onNavigate?.();
    },
    [activeTab, router, onNavigate]
  );

  const handleDeleteMap = useCallback(async (documentId: string) => {
    await idb.deleteDocument(documentId);
    setUpdateTrigger(Date.now());
  }, []);

  if (loading) {
    return (
      <Flex align="center" justify="center" className="py-10">
        <Text color="gray" size="2">
          Loading maps…
        </Text>
      </Flex>
    );
  }

  const hasAnyMaps = communityMaps.length > 0 || districtMaps.length > 0;

  if (!hasAnyMaps) {
    if (showFilters) {
      return (
        <Flex
          direction="column"
          gap="2"
          className="rounded-lg border border-dashed border-gray-300 p-5 bg-gray-50"
        >
          <Heading size="4">No local maps found</Heading>
          <Text size="2" color="gray">
            Start a new map, then return here to manage local saved maps.
          </Text>
          <Box>
            <Link href="/map">Go to mapping app</Link>
          </Box>
        </Flex>
      );
    }
    return (
      <Flex align="center" justify="center" className="py-10">
        <Text color="gray" size="2">
          No recent maps yet.
        </Text>
      </Flex>
    );
  }

  const cardList = (
    <Flex direction="column" gap="2" pr={useScrollArea ? '3' : undefined} pt="1">
      {paginatedMaps.map((userMap, i) => (
        <RecentMapCard
          key={userMap.document_id || i}
          active={mapDocument?.document_id === userMap.document_id}
          data={userMap}
          tab={activeTab}
          onSelect={handleMapDocument}
          onDelete={() => handleDeleteMap(userMap.document_id)}
        />
      ))}
    </Flex>
  );

  const paginationControls = pageSize && totalPages > 1 && (
    <Flex justify="center" align="center" gap="3" pt="2">
      <IconButton
        variant="soft"
        color="gray"
        size="1"
        disabled={safePage === 0}
        onClick={() => setCurrentPage(p => p - 1)}
      >
        <ChevronLeftIcon />
      </IconButton>
      <Text size="2" color="gray">
        Page {safePage + 1} of {totalPages}
      </Text>
      <IconButton
        variant="soft"
        color="gray"
        size="1"
        disabled={safePage >= totalPages - 1}
        onClick={() => setCurrentPage(p => p + 1)}
      >
        <ChevronRightIcon />
      </IconButton>
    </Flex>
  );

  const isFiltered = showFilters && (textFilter || moduleFilter !== 'all');

  return (
    <Flex direction="column" gap="3">
      {showFilters && (
        <Flex gap="4" align="start" direction={{initial: 'column', md: 'row'}}>
          <Box className="w-full md:flex-1">
            <Text as="label" size="2" weight="medium">
              Text filter
            </Text>
            <TextField.Root
              value={textFilter}
              onChange={event => setTextFilter(event.target.value)}
              placeholder="Filter by map name or type"
            >
              <TextField.Slot>
                <MagnifyingGlassIcon />
              </TextField.Slot>
            </TextField.Root>
          </Box>
          <Box>
            <Text as="label" size="2" weight="medium">
              Map module
            </Text>
            <br />
            <Select.Root value={moduleFilter} onValueChange={setModuleFilter}>
              <Select.Trigger placeholder="All modules" />
              <Select.Content>
                <Select.Item value="all">All modules</Select.Item>
                {moduleOptions.map(module => (
                  <Select.Item key={module} value={module}>
                    {module}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>
        </Flex>
      )}

      {showFilters && (
        <Flex justify="between" align="center">
          <Text size="2" color="gray">
            Showing {filteredMaps.length} of {recentMaps.length}{' '}
            {activeTab === MAP_TABS.COMMUNITY ? 'community' : 'district'} map
            {filteredMaps.length === 1 ? '' : 's'}
          </Text>

          {isFiltered && (
            <Button variant="soft" color="gray" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </Flex>
      )}

      {!mapType && (
        <Flex justify="center">
          <SegmentedControl.Root
            value={activeTab}
            onValueChange={v => setTabState(v as MapTab)}
            size="2"
          >
            <SegmentedControl.Item value={MAP_TABS.DISTRICTS}>
              District Maps{districtMaps.length > 0 ? ` (${districtMaps.length})` : ''}
            </SegmentedControl.Item>
            <SegmentedControl.Item value={MAP_TABS.COMMUNITY}>
              Community Maps{communityMaps.length > 0 ? ` (${communityMaps.length})` : ''}
            </SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
      )}
      {recentMaps.length === 0 ? (
        <Flex align="center" justify="center" className="py-10">
          <Text color="gray" size="2">
            No {MAP_TAB_LABELS[activeTab]} maps yet.
          </Text>
        </Flex>
      ) : useScrollArea ? (
        <ScrollArea scrollbars="vertical" style={{maxHeight}}>
          {cardList}
          {paginationControls}
        </ScrollArea>
      ) : (
        <>
          {cardList}
          {paginationControls}
        </>
      )}
    </Flex>
  );
};

const CopyLinkDropdown: React.FC<{
  editUrl: string;
  publicUrl: string | null;
}> = ({editUrl, publicUrl}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <DropdownMenu.Root>
      <Tooltip content="Copy links">
        <DropdownMenu.Trigger>
          <IconButton variant="ghost" color="gray" size="1" onClick={e => e.stopPropagation()}>
            <Link2Icon />
          </IconButton>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Content align="end" onClick={e => e.stopPropagation()}>
        <DropdownMenu.Item onClick={() => handleCopy(editUrl, 'edit')}>
          {copiedKey === 'edit' ? 'Copied!' : 'Copy edit link'}
        </DropdownMenu.Item>
        {publicUrl && (
          <DropdownMenu.Item onClick={() => handleCopy(publicUrl, 'public')}>
            {copiedKey === 'public' ? 'Copied!' : 'Copy public link'}
          </DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};

const RecentMapCard: React.FC<{
  data: DocumentObject;
  onSelect: (data: DocumentObject) => void;
  active: boolean;
  tab: MapTab;
  onDelete: (data: DocumentObject) => void;
}> = ({data, onSelect, active, tab, onDelete}) => {
  const mapName = data?.map_metadata?.name || data.districtr_map_slug || 'Untitled Map';
  const draftStatus = data?.map_metadata?.draft_status ?? DRAFT_STATUSES.SCRATCH;
  const zoneCount =
    tab === MAP_TABS.COMMUNITY
      ? (data.community_metadata_list?.length ?? data.num_communities ?? 0)
      : (data.num_districts ?? 0);
  const zoneLabel = MAP_TAB_LABEL_PLURAL[tab];
  const geoLabel = data.parent_geo_unit_type || data.gerrydb_table || data.districtr_map_slug;
  const route = routeForTab(tab);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const editUrl = `${origin}/${route}/edit/${data.document_id}`;
  const publicUrl = data.public_id ? `${origin}/${route}/${data.public_id}` : null;

  return (
    <StyledCard active={active} onClick={() => !active && onSelect(data)}>
      <Flex direction="row" align="center" justify="between" gap="3">
        <Flex direction="column" gap="1" className="min-w-0">
          <Flex align="center" gap="2" wrap="wrap">
            <Text weight="medium" size="2" truncate {...(!active ? {'data-map-name': ''} : {})}>
              {mapName}
            </Text>
            {active && (
              <Badge size="1" color="blue" variant="soft">
                Current
              </Badge>
            )}
            <Badge size="1" color={DRAFT_STATUS_COLORS[draftStatus]} variant="soft">
              {DRAFT_STATUS_TEXT[draftStatus]}
            </Badge>
          </Flex>
          <Flex align="center" gap="3" wrap="wrap">
            {geoLabel && (
              <Text size="1" color="gray">
                {geoLabel}
              </Text>
            )}
            {zoneCount > 0 && (
              <Text size="1" color="gray">
                {zoneCount} {zoneLabel}
              </Text>
            )}
            <Text size="1" color="gray">
              {formatRelativeDate(data.updated_at)}
            </Text>
            {!active && (
              <Flex
                align="center"
                gap="1"
                data-open-hint=""
                style={{opacity: 0, transition: 'opacity 150ms'}}
              >
                <Text size="1" weight="medium" color="blue">
                  Open map
                </Text>
                <ArrowRightIcon className="text-blue-600 w-3 h-3" />
              </Flex>
            )}
          </Flex>
        </Flex>

        <Flex align="center" gap="1" ml="auto" className="flex-shrink-0">
          <CopyLinkDropdown editUrl={editUrl} publicUrl={publicUrl} />
          {!active && (
            <AlertDialog.Root>
              <AlertDialog.Trigger>
                <Tooltip content="Remove from list">
                  <IconButton
                    variant="ghost"
                    color="gray"
                    size="1"
                    className="hover:!text-red-600"
                    onClick={e => e.stopPropagation()}
                  >
                    <TrashIcon />
                  </IconButton>
                </Tooltip>
              </AlertDialog.Trigger>
              <AlertDialog.Content maxWidth="400px">
                <AlertDialog.Title>Remove map</AlertDialog.Title>
                <AlertDialog.Description>
                  This will remove the map from your recent list. This cannot be undone.
                </AlertDialog.Description>
                <Flex gap="3" mt="4" justify="end">
                  <AlertDialog.Cancel>
                    <Button variant="soft" color="gray">
                      Cancel
                    </Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action>
                    <Button variant="solid" color="red" onClick={() => onDelete(data)}>
                      Remove
                    </Button>
                  </AlertDialog.Action>
                </Flex>
              </AlertDialog.Content>
            </AlertDialog.Root>
          )}
        </Flex>
      </Flex>
    </StyledCard>
  );
};
