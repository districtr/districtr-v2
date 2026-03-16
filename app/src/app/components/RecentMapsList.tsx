import React, {useCallback, useEffect, useState} from 'react';
import {TrashIcon, Pencil1Icon, ExternalLinkIcon, ArrowRightIcon} from '@radix-ui/react-icons';
import {
  Button,
  Flex,
  Text,
  Badge,
  SegmentedControl,
  IconButton,
  AlertDialog,
  Tooltip,
  Card,
  ScrollArea,
} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {DocumentObject, DraftStatus} from '@utils/api/apiHandlers/types';
import {idb} from '@/app/utils/idb/idb';
import {useUserMaps} from '@/app/hooks/useUserMaps';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import type {MapMode} from '@/app/constants/map/mapModeDefaults';

export type MapTab = 'districts' | 'community';
export const mapTabFromMode = (mode: MapMode): MapTab =>
  mode === 'coi' ? 'community' : 'districts';
export const routeForTab = (tab: MapTab) => (tab === 'community' ? 'coi' : 'map');

const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  scratch: 'Scratch Work',
  in_progress: 'In Progress',
  ready_to_share: 'Ready to Share',
};

const DRAFT_STATUS_COLORS: Record<DraftStatus, 'gray' | 'orange' | 'green'> = {
  scratch: 'gray',
  in_progress: 'orange',
  ready_to_share: 'green',
};

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
}

export const RecentMapsList: React.FC<RecentMapsListProps> = ({maxHeight = '55vh', onNavigate}) => {
  const router = useRouter();
  const mapDocument = useMapStore(store => store.mapDocument);
  const mapMode = useMapControlsStore(store => store.mapMode);
  const [activeTab, setActiveTab] = useState<MapTab>(mapTabFromMode(mapMode));
  const [updateTrigger, setUpdateTrigger] = useState<string | null | number>(null);
  const {communityMaps, districtMaps} = useUserMaps(updateTrigger);
  const recentMaps = activeTab === 'community' ? communityMaps : districtMaps;

  useEffect(() => {
    setActiveTab(mapTabFromMode(mapMode));
  }, [mapMode]);

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

  const hasAnyMaps = communityMaps.length > 0 || districtMaps.length > 0;
  if (!hasAnyMaps) {
    return (
      <Flex align="center" justify="center" className="py-10">
        <Text color="gray" size="2">
          No recent maps yet.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      <Flex justify="center">
        <SegmentedControl.Root
          value={activeTab}
          onValueChange={v => setActiveTab(v as MapTab)}
          size="2"
        >
          <SegmentedControl.Item value="districts">
            District Maps{districtMaps.length > 0 ? ` (${districtMaps.length})` : ''}
          </SegmentedControl.Item>
          <SegmentedControl.Item value="community">
            Community Maps{communityMaps.length > 0 ? ` (${communityMaps.length})` : ''}
          </SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      {recentMaps.length === 0 ? (
        <Flex align="center" justify="center" className="py-10">
          <Text color="gray" size="2">
            No {activeTab === 'community' ? 'community' : 'district'} maps yet.
          </Text>
        </Flex>
      ) : (
        <ScrollArea scrollbars="vertical" style={{maxHeight}}>
          <Flex direction="column" gap="2" pr="3" pt="1">
            {recentMaps.map((userMap, i) => (
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
        </ScrollArea>
      )}
    </Flex>
  );
};

const CopyLinkButton: React.FC<{
  url: string;
  label: string;
  icon: React.ReactNode;
}> = ({url, label, icon}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tooltip content={copied ? 'Copied!' : label}>
      <IconButton variant="ghost" color={copied ? 'green' : 'gray'} size="1" onClick={handleCopy}>
        {icon}
      </IconButton>
    </Tooltip>
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
  const draftStatus = data?.map_metadata?.draft_status ?? 'scratch';
  const zoneCount =
    tab === 'community'
      ? (data.coi_communities?.length ?? data.num_communities ?? 0)
      : (data.num_districts ?? 0);
  const zoneLabel = tab === 'community' ? 'communities' : 'districts';
  const geoLabel = data.parent_geo_unit_type || data.gerrydb_table || data.districtr_map_slug;
  const route = routeForTab(tab);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const editUrl = `${origin}/${route}/edit/${data.document_id}`;
  const publicUrl = data.public_id ? `${origin}/${route}/${data.public_id}` : null;

  return (
    <Card
      className={[
        'transition-all duration-150 group/card',
        active
          ? '!bg-blue-50 !border-blue-200'
          : 'cursor-pointer hover:!bg-blue-50/60 hover:!shadow-md hover:!border-blue-300 hover:!-translate-y-px',
      ].join(' ')}
      onClick={() => !active && onSelect(data)}
    >
      <Flex direction="row" align="center" gap="3">
        <Flex direction="column" gap="1" className="flex-1 min-w-0">
          <Flex align="center" gap="2" wrap="wrap">
            <Text weight="medium" size="2" truncate>
              {mapName}
            </Text>
            {active && (
              <Badge size="1" color="blue" variant="soft">
                Current
              </Badge>
            )}
            <Badge size="1" color={DRAFT_STATUS_COLORS[draftStatus]} variant="soft">
              {DRAFT_STATUS_LABELS[draftStatus]}
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
          </Flex>
        </Flex>

        <Flex align="center" gap="1" className="flex-shrink-0">
          <CopyLinkButton url={editUrl} label="Copy edit link" icon={<Pencil1Icon />} />
          {publicUrl && (
            <CopyLinkButton url={publicUrl} label="Copy public link" icon={<ExternalLinkIcon />} />
          )}
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
          {!active && (
            <Flex
              align="center"
              gap="1"
              className="opacity-0 group-hover/card:opacity-100 transition-opacity ml-1"
            >
              <Text size="1" weight="medium" color="blue">
                Open
              </Text>
              <ArrowRightIcon className="text-blue-600" />
            </Flex>
          )}
        </Flex>
      </Flex>
    </Card>
  );
};
