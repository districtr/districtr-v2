import {Box, Badge, Checkbox, IconButton, Flex, Button, Text, TextField} from '@radix-ui/themes';
import {Root as CheckboxRoot, Indicator as CheckboxIndicator} from '@radix-ui/react-checkbox';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {EyeClosedIcon, EyeOpenIcon, Pencil1Icon, CheckIcon} from '@radix-ui/react-icons';
import {useRef, useEffect, useState, useCallback, Dispatch, SetStateAction} from 'react';
import {useToolbarStore} from '@store/toolbarStore';
// import {CommunityAssignmentsDebug} from '@components/Toolbar/CommunityAssignmentsDebug';

// =========================
// == Brush Mode Controls ==
// =========================

const ColorSwatchTray = ({
  color,
  isReadOnly,
  onChange,
  label,
}: {
  color: string;
  isReadOnly?: boolean;
  onChange?: (color: string) => void;
  label: string;
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Box style={{position: 'relative', flex: '0 0 auto'}}>
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        disabled={isReadOnly}
        onClick={() => !isReadOnly && inputRef.current?.click()}
        aria-label={label}
      >
        <img src="/paint-tray.svg" alt="" width={18} height={18} aria-hidden="true" />
      </IconButton>
      {onChange ? (
        <input
          ref={inputRef}
          type="color"
          value={color}
          onChange={e => onChange(e.target.value)}
          style={{position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none'}}
          tabIndex={-1}
        />
      ) : null}
    </Box>
  );
};

const CommunityFormGroupItem = ({
  id,
  name,
  color,
  visible,
  isReadOnly,
}: {
  id: number;
  name: string;
  color: string;
  visible: boolean;
  isReadOnly: boolean;
}) => {
  const toggleCommunityVisible = useMapControlsStore(state => state.toggleCommunityVisible);
  const setCommunityName = useMapControlsStore(state => state.setCommunityName);
  const setCommunityColor = useMapControlsStore(state => state.setCommunityColor);
  const [isEditingName, setIsEditingName] = useState(false);
  const selectedCommunityId = useMapControlsStore(state => state.selectedCommunityId);
  const setSelectedCommunityId = useMapControlsStore(state => state.setSelectedCommunityId);
  const textFieldContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <Flex key={id} align="center" gap="2" style={{width: '100%', minWidth: 0}}>
      <Text as="label" size="1" style={{flex: 1, minWidth: 0, display: 'block'}}>
        <Flex direction="row" align="center" gap="2" style={{width: '100%', minWidth: 0}}>
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
            style={{
              border: `2px solid ${color}`,
            }}
          >
            {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </IconButton>
          <Box ref={textFieldContainerRef} style={{flex: 1, minWidth: 0}}>
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
              className="flex-grow transistion-colors hover:bg-gray-100"
              disabled={isReadOnly || !isEditingName}
              readOnly={!isEditingName}
              maxLength={40}
              style={{
                width: '100%',
                minWidth: 0,
                border:
                  selectedCommunityId === id
                    ? '1px solid var(--accent-9, #3b82f6)'
                    : '1px solid transparent',
                boxShadow:
                  selectedCommunityId === id ? '0 0 0 1px var(--accent-7, #93c5fd)' : 'none',
                borderRadius: 6,
                cursor: isReadOnly ? 'default' : 'pointer',
              }}
            />
          </Box>
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
              requestAnimationFrame(() => {
                // NOTE: Peter: The TextField component is a wrapper around an html input element
                // so we can just query it here.
                const input = textFieldContainerRef.current?.querySelector('input');
                if (input) {
                  input.focus();
                  input.select();
                }
              });
            }}
            disabled={isReadOnly}
            aria-label={`Edit ${name} name`}
          >
            <Pencil1Icon />
          </IconButton>
          <ColorSwatchTray
            color={color}
            isReadOnly={isReadOnly}
            onChange={nextColor => setCommunityColor(id, nextColor)}
            label={`Color for ${name}`}
          />
        </Flex>
      </Text>
    </Flex>
  );
};

// FIXME: There needs to be a link between this and the global maximum number of communities.
const CommunityFormList = ({isReadOnly}: {isReadOnly: boolean}) => {
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
          ? {
              maxHeight: maxListHeight,
              overflowY: 'auto',
              // Inset content on both sides so icon borders don't get clipped by scroll container edges.
              paddingLeft: 4,
              paddingRight: 8,
              paddingTop: 2,
              paddingBottom: 2,
            }
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
              isReadOnly={isReadOnly}
            />
          ))}
      </Flex>
    </Box>
  );
};

export const CommunityBrushControls = ({isReadOnly}: {isReadOnly: boolean}) => {
  const addCommunity = useMapControlsStore(state => state.addCommunity);
  const removeCommunities = useMapControlsStore(state => state.removeCommunities);
  const selectedCommunityId = useMapControlsStore(state => state.selectedCommunityId);
  const communityList = useMapControlsStore(state => state.communityList);
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const maxVisible = toolbarLocation === 'map' ? 3 : 7;
  const isListScrollable = communityList.length > maxVisible;
  const setAllCommunitiesVisibility = useMapControlsStore(
    state => state.setAllCommunitiesVisibility
  );
  const showCommunities = useMapControlsStore(state => state.mapOptions.showCommunities);

  const setMapOptions = useMapControlsStore(state => state.setMapOptions);

  return (
    <Flex direction="column" gap="2">
      <Flex direction="row" gap="3" align="center" style={{paddingLeft: isListScrollable ? 4 : 0}}>
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={() => {
            const nextVisibility = !showCommunities;
            setMapOptions({showCommunities: nextVisibility});
            setAllCommunitiesVisibility(nextVisibility);
          }}
          disabled={isReadOnly}
          style={{border: '2px solid #9CA3AF'}}
        >
          {showCommunities ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </IconButton>
        {/* TODO: Peter: Make this into a serchable field thing */}
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
      </Flex>
      <CommunityFormList isReadOnly={isReadOnly} />
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
    </Flex>
  );
};

// =========================
// == Erase Mode Controls ==
// =========================

const styles = `
.communityCheckbox {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--cc);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.communityCheckbox[data-state="checked"] {
  background: var(--cc);
}
.communityCheckboxIndicator {
  color: white;
  display: inline-flex;
}
`;

function CommunityCheckbox({
  color,
  checked,
  disabled,
  onCheckedChange,
}: {
  color: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <>
      <style>{styles}</style>
      <CheckboxRoot
        className="communityCheckbox"
        style={{['--cc' as any]: color}}
        checked={checked}
        disabled={!!disabled}
        onCheckedChange={onCheckedChange}
      >
        <CheckboxIndicator className="communityCheckboxIndicator">
          <CheckIcon />
        </CheckboxIndicator>
      </CheckboxRoot>
    </>
  );
}

function useInitialVisibilitySnapshot() {
  const communityList = useMapControlsStore(state => state.communityList);
  const setCommunitiesVisible = useMapControlsStore(state => state.setCommunitiesVisible);

  const initialVisibilityRef = useRef<Map<number, boolean> | null>(null);
  const communityListRef = useRef(communityList);

  useEffect(() => {
    communityListRef.current = communityList;
  }, [communityList]);

  // Store the initial visibility states of communities on first render so that we can reset
  // to them when we move back to other things.
  useEffect(() => {
    if (initialVisibilityRef.current) return;
    if (!communityList || communityList.length === 0) return;

    initialVisibilityRef.current = new Map(
      communityList.map(community => [community.id, community.visible])
    );
  }, [communityList]);

  const restoreVisibility = useCallback(() => {
    const snapshot = initialVisibilityRef.current;
    if (!snapshot) return;

    // Restore only for ids that existed at snapshot time.
    const newVisibility: Map<number, boolean> = new Map();
    const currentList = communityListRef.current;
    let hasSnapshotIds = false;
    for (const c of currentList) {
      if (!snapshot.has(c.id)) continue;
      hasSnapshotIds = true;
      newVisibility.set(c.id, !!snapshot.get(c.id)!);
    }
    if (!hasSnapshotIds) return;
    setCommunitiesVisible(newVisibility);
  }, [setCommunitiesVisible]);

  return {initialVisibilityRef, restoreVisibility};
}

const CommunityCheckboxList = ({
  isReadOnly,
  selectedIds,
  setSelectedIds,
}: {
  isReadOnly: boolean;
  selectedIds: number[];
  setSelectedIds: Dispatch<SetStateAction<number[]>>;
}) => {
  const communityList = useMapControlsStore(state => state.communityList);
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const maxVisible = toolbarLocation === 'map' ? 3 : 7;
  const maxListHeight = maxVisible * 44;
  const setAllCommunitiesVisibility = useMapControlsStore(
    state => state.setAllCommunitiesVisibility
  );
  const setCommunitiesVisible = useMapControlsStore(state => state.setCommunitiesVisible);

  return (
    <Box
      style={
        communityList.length > maxVisible
          ? {
              maxHeight: maxListHeight,
              overflowY: 'auto',
              paddingLeft: 4,
              paddingRight: 8,
              paddingTop: 2,
              paddingBottom: 2,
            }
          : undefined
      }
    >
      <Flex direction="column" gap="2" style={{width: '100%'}}>
        {communityList
          .sort((a, b) => a.displayPosition - b.displayPosition)
          .map(community => (
            <Flex key={community.id} direction="row" align="center" gap="2" style={{width: '100%'}}>
              <CommunityCheckbox
                color={community.color}
                checked={selectedIds.includes(community.id)}
                disabled={isReadOnly}
                onCheckedChange={next => {
                  const isChecked = !!next;
                  // Only do "start from none" when selecting first item from empty.
                  if (isChecked && selectedIds.length === 0) {
                    setAllCommunitiesVisibility(false);
                  }
                  setSelectedIds(prev =>
                    isChecked
                      ? prev.includes(community.id)
                        ? prev
                        : [...prev, community.id]
                      : prev.filter(id => id !== community.id)
                  );
                  // Keep visibility aligned with checkbox state.
                  setCommunitiesVisible(new Map([[community.id, isChecked]]));
                }}
              />

              <Box style={{flex: 1, minWidth: 0}}>
                <TextField.Root
                  value={community.name}
                  size="1"
                  disabled={true}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    border: '1px solid transparent',
                    borderRadius: 6,
                  }}
                />
              </Box>
            </Flex>
          ))}
      </Flex>
    </Box>
  );
};

export const CommunityEraseControls = ({isReadOnly}: {isReadOnly: boolean}) => {
  const removeCommunities = useMapControlsStore(state => state.removeCommunities);
  const setAllCommunitiesVisibility = useMapControlsStore(
    state => state.setAllCommunitiesVisibility
  );
  const communityList = useMapControlsStore(state => state.communityList);
  const toolbarLocation = useToolbarStore(state => state.toolbarLocation);
  const maxVisible = toolbarLocation === 'map' ? 3 : 7;
  const isListScrollable = communityList.length > maxVisible;

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const canRemove = selectedIds.length > 0;
  const allSelected =
    communityList.length > 0 && communityList.every(c => selectedIds.includes(c.id));

  // Store state on mount so that we can reset to previous visibilities when we move away
  const {restoreVisibility} = useInitialVisibilitySnapshot();

  // Restore on unmount
  useEffect(() => {
    return () => {
      restoreVisibility();
    };
  }, [restoreVisibility]);

  return (
    <Flex direction="column" gap="2">
      <Flex direction="row" gap="3" align="center" style={{paddingLeft: isListScrollable ? 4 : 0}}>
        <CommunityCheckbox
          color="#9CA3AF"
          checked={allSelected}
          disabled={isReadOnly || communityList.length === 0}
          onCheckedChange={next => {
            if (next) {
              setSelectedIds(communityList.map(c => c.id));
            } else {
              setSelectedIds([]);
            }
            setAllCommunitiesVisibility(next);
          }}
        />
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
      </Flex>

      <CommunityCheckboxList
        isReadOnly={isReadOnly}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
      />

      <Flex direction="row" gap="2" wrap="wrap">
        <Button
          size="1"
          variant="soft"
          color="red"
          onClick={() => {
            if (!canRemove) return;
            removeCommunities(selectedIds);
            setSelectedIds([]);
          }}
          disabled={isReadOnly || !canRemove}
        >
          Remove Communities
        </Button>
      </Flex>
    </Flex>
  );
};

export const CommunityControls = ({mode}: {mode: 'brush' | 'erase'}) => {
  const isReadOnly = useMapStore(state => state.mapStatus?.access) === 'read';

  return (
    // <Flex direction="column" gapY="2" justify="between" wrap="wrap">
    <>
      {mode === 'brush' ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <CommunityBrushControls isReadOnly={isReadOnly} />
        </div>
      ) : (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <CommunityEraseControls isReadOnly={isReadOnly} />
        </div>
      )}
      {/* {process.env.NODE_ENV === 'development' ? <CommunityAssignmentsDebug /> : null} */}
    </>
  );
};
