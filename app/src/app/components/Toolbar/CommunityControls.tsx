import {Box, Badge, IconButton, Flex, Button, Text, TextField} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {EyeClosedIcon, EyeOpenIcon, Pencil1Icon} from '@radix-ui/react-icons';
import {useRef, useEffect, useState} from 'react';
import {useToolbarStore} from '@store/toolbarStore';
// import {CommunityAssignmentsDebug} from '@components/Toolbar/CommunityAssignmentsDebug';

const CommunityFormGroupItem = ({
  id,
  name,
  color,
  visible,
  mode,
  isReadOnly,
}: {
  id: number;
  name: string;
  color: string;
  visible: boolean;
  mode: 'brush' | 'erase';
  isReadOnly: boolean;
}) => {
  const toggleCommunityVisible = useMapControlsStore(state => state.toggleCommunityVisible);
  const setCommunityName = useMapControlsStore(state => state.setCommunityName);
  const setCommunityColor = useMapControlsStore(state => state.setCommunityColor);
  const [isEditingName, setIsEditingName] = useState(false);
  const selectedCommunityId = useMapControlsStore(state => state.selectedCommunityId);
  const setSelectedCommunityId = useMapControlsStore(state => state.setSelectedCommunityId);

  return (
    <Flex key={id} align="center" gap="2">
      <Text as="label" size="1" className="flex-grow">
        <Flex direction="row" align="center" gap="2">
          {mode === 'brush' ? (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onPointerDown={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                toggleCommunityVisible(id);
              }}
              disabled={isReadOnly}
              aria-label={visible ? 'Hide community' : 'Show community'}
            >
              {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
            </IconButton>
          ) : null}
          <TextField.Root
            value={name}
            onChange={e => setCommunityName(id, e.target.value)}
            onPointerDown={e => {
              e.stopPropagation();
              if (!isReadOnly) setSelectedCommunityId(id);
            }}
            onFocus={() => {
              if (!isReadOnly) setSelectedCommunityId(id);
            }}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            size="1"
            className="flex-grow"
            disabled={isReadOnly || !isEditingName}
            readOnly={!isEditingName}
            maxLength={40}
            style={{
              border:
                selectedCommunityId === id
                  ? '1px solid var(--accent-9, #3b82f6)'
                  : '1px solid transparent',
              boxShadow: selectedCommunityId === id ? '0 0 0 1px var(--accent-7, #93c5fd)' : 'none',
              borderRadius: 6,
              cursor: isReadOnly ? 'default' : 'pointer',
            }}
          />
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onPointerDown={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              if (isReadOnly) return;
              setSelectedCommunityId(id);
              setIsEditingName(true);
            }}
            disabled={isReadOnly}
            aria-label={`Edit ${name} name`}
          >
            <Pencil1Icon />
          </IconButton>
          <Box>
            <input
              aria-label={`Color for ${name}`}
              type="color"
              value={color}
              onChange={e => setCommunityColor(id, e.target.value)}
              disabled={isReadOnly}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid #D1D5DB',
                padding: 0,
                background: 'transparent',
                // opacity: community.opacity * communityOpacity,
              }}
            />
          </Box>
        </Flex>
      </Text>
    </Flex>
  );
};

const CommunityFormList = ({isReadOnly, mode}: {isReadOnly: boolean; mode: 'brush' | 'erase'}) => {
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const maxVisible = toolbarLocation === 'map' ? 3 : 7;
  const maxListHeight = maxVisible * 44; //TODO: Chnage this to the document number of communities
  const communityList = useMapControlsStore(state => state.communityList);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Scroll to bottom when a new community is added and the list exceeds the max visible count
  useEffect(() => {
    if (communityList.length > maxVisible && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [communityList.length, maxVisible]);

  return (
    <Box
      ref={listRef}
      style={
        communityList.length > maxVisible
          ? {maxHeight: maxListHeight, overflowY: 'auto', paddingRight: 4}
          : undefined
      }
    >
      <Flex direction="column" gap="2">
        {communityList
          .sort((a, b) => a.displayPosition - b.displayPosition)
          .map(community => (
            <CommunityFormGroupItem
              key={community.id}
              id={community.id}
              name={community.name}
              color={community.color}
              visible={community.visible}
              mode={mode}
              isReadOnly={isReadOnly}
            />
          ))}
      </Flex>
    </Box>
  );
};

export const CommunityControls = ({mode}: {mode: 'brush' | 'erase'}) => {
  const addCommunity = useMapControlsStore(state => state.addCommunity);
  const removeCommunities = useMapControlsStore(state => state.removeCommunities);
  const selectedCommunityId = useMapControlsStore(state => state.selectedCommunityId);
  const access = useMapStore(state => state.mapStatus?.access);
  const isReadOnly = access === 'read';
  const setAllCommunitiesVisibility = useMapControlsStore(
    state => state.setAllCommunitiesVisibility
  );
  const showCommunities = useMapControlsStore(state => state.mapOptions.showCommunities);

  const setMapOptions = useMapControlsStore(state => state.setMapOptions);

  return (
    // <Flex direction="column" gapY="2" justify="between" wrap="wrap">
    <Flex direction="column" gap="2">
      <Flex direction="row" gap="3" align="center">
        {/* Row 1 */}
        {mode === 'brush' ? (
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => {
              const nextVisibility = !showCommunities;
              console.log('Toggling all communities visibility to', nextVisibility);
              setMapOptions({showCommunities: nextVisibility});
              setAllCommunitiesVisibility(nextVisibility);
            }}
            disabled={isReadOnly}
            aria-label="Select a community to start drawing it!"
          >
            {showCommunities ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </IconButton>
        ) : null}

        {mode === 'brush' ? (
          <Badge
            className="flex-grow"
            size="2"
            style={{
              color: 'black',
              flexGrow: 1,
              textAlign: 'center',
              background: '#eee',
              justifyContent: 'center',
            }}
          >
            <Text size="1">Select a Community to Start Drawing!</Text>
          </Badge>
        ) : (
          <Badge
            className="flex-grow"
            size="2"
            style={{
              color: 'black',
              flexGrow: 1,
              textAlign: 'center',
              background: '#eee',
              justifyContent: 'center',
            }}
          >
            <Text size="1">Use the Checkbox to select what to Erase.</Text>
          </Badge>
        )}
      </Flex>

      {/* Row 2 */}
      {mode === 'brush' ? <CommunityFormList isReadOnly={isReadOnly} mode={mode} /> : null}

      {/* Row 3 */}
      {mode === 'brush' ? (
        <Flex direction="row" gap="2" wrap="wrap">
          <Button size="1" variant="soft" onClick={addCommunity} disabled={isReadOnly}>
            Add Community
          </Button>
          <Button
            size="1"
            variant="soft"
            color="red"
            onClick={() => {
              removeCommunities([selectedCommunityId]);
            }}
            disabled={isReadOnly}
          >
            Remove Community
          </Button>
        </Flex>
      ) : null}

      {mode === 'erase' ? (
        <Flex direction="row" gap="2" wrap="wrap">
          <Button
            size="1"
            variant="soft"
            color="red"
            onClick={() => {
              removeCommunities([selectedCommunityId]);
            }}
            disabled={isReadOnly}
          >
            Remove Communities
          </Button>
        </Flex>
      ) : null}
      {/* {process.env.NODE_ENV === 'development' ? <CommunityAssignmentsDebug /> : null} */}
    </Flex>
  );
};
