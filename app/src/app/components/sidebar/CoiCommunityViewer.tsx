import React from 'react';
import {Box, Flex, Text, IconButton, Heading} from '@radix-ui/themes';
import {EyeClosedIcon, EyeOpenIcon} from '@radix-ui/react-icons';
import {Tooltip} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {sortCommunitiesByRenderOrder} from '@/app/utils/communities';
import {MAP_MODES} from '@constants/map/mode';

/**
 * A single row in the public community viewer list.
 * Displays the community color swatch, name, description, and a visibility toggle.
 * Clicking the row selects the community (bringing it to the front on the map).
 */
const CoiCommunityViewerRow: React.FC<{
  community: {id: number; name: string; description: string; color: string};
  isSelected: boolean;
  isVisible: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
}> = ({community, isSelected, isVisible, onSelect, onToggleVisibility}) => {
  return (
    <Flex
      direction="row"
      align="center"
      gap="2"
      py="1"
      px="1"
      maxWidth="100%"
      className={`rounded cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-gray-50' : ''}`}
      onClick={onSelect}
    >
      <Box
        className="rounded border border-gray-300 flex-shrink-0"
        style={{
          backgroundColor: community.color,
          width: '1.5rem',
          height: '1.5rem',
        }}
      />
      <Box flexGrow="0" flexShrink="0">
        <Text size="2" weight={isSelected ? 'bold' : 'regular'}>
          {community.name}
        </Text>
      </Box>
      <Box className="overflow-hidden" flexGrow="1" mr="2">
        <Tooltip content={community.description}>
          <Text size="2" color="gray" truncate>
            {community.description}
          </Text>
        </Tooltip>
      </Box>
      <IconButton
        size="1"
        variant="ghost"
        onClick={e => {
          e.stopPropagation();
          onToggleVisibility();
        }}
      >
        <Tooltip content={isVisible ? 'Hide community' : 'Show community'}>
          {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </Tooltip>
      </IconButton>
    </Flex>
  );
};

/**
 * Read-only community list for the public/shared COI map view.
 * Renders in the sidebar when the map is in COI mode and the user does not have edit access.
 *
 * Allows viewers to:
 * - See community names, descriptions, and colors
 * - Toggle individual community visibility on/off
 * - Select a community to bring it to the front of the map
 *
 * No edit controls (add, remove, rename, recolor) are exposed.
 */
export const CoiCommunityViewer: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const communities = useMapStore(state => state.communities);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const selectCommunity = useSelectCommunity();

  if (mapMode !== MAP_MODES.COI || isEditing || !communities.length) return null;

  const sorted = sortCommunitiesByRenderOrder(communities);

  return (
    <Box>
      <Heading size="3" mb="2">
        Communities
      </Heading>
      <Flex direction="column" gap="0">
        {sorted.map(community => {
          const isVisible = communityVisibility.get(community.id) ?? true;
          return (
            <CoiCommunityViewerRow
              key={community.id}
              community={community}
              isSelected={selectedZone === community.id}
              isVisible={isVisible}
              onSelect={() => selectCommunity(community.id)}
              onToggleVisibility={() => {
                const prev = communityVisibility.get(community.id) ?? true;
                setCommunityVisibility(community.id, !prev);
              }}
            />
          );
        })}
      </Flex>
    </Box>
  );
};
