import React, {useEffect, useMemo, useState} from 'react';
import {AlertDialog, Box, Flex, Button, IconButton} from '@radix-ui/themes';
import {EyeOpenIcon, EyeClosedIcon, PlusIcon} from '@radix-ui/react-icons';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {CoiPicker} from './CoiPicker';
import {COI_MIN_COMMUNITIES, COI_MAX_COMMUNITIES} from '@/app/constants/map/mapDefaults';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {getUnusedCommunityColors} from '@/app/utils/communities';

export const CoiZonePicker: React.FC = () => {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const communities = useMapStore(state => state.communities);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const colorScheme = useColorScheme();

  const addCommunity = useMapStore(state => state.addCommunity);
  const removeCommunity = useMapStore(state => state.removeCommunity);
  const updateCommunity = useMapStore(state => state.updateCommunity);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const setCommunityVisibilityForCommunities = useCoiAssignmentsStore(
    state => state.setCommunityVisibilityForCommunities
  );
  const selectCommunity = useSelectCommunity();
  const [communityToRemove, setCommunityToRemove] = useState<number | null>(null);

  const communityNameLengthLimit = useMapStore(
    state => state.mapDocument?.community_name_length_limit ?? 40
  );
  const availableCommunityColors = useMemo(
    () => getUnusedCommunityColors(communities, colorScheme),
    [communities, colorScheme]
  );

  const nonSelectedCommunityIds = communities
    .map(community => community.id)
    .filter(communityId => communityId !== selectedZone);
  const anyNotSelectedVisible = nonSelectedCommunityIds.some(
    communityId => communityVisibility.get(communityId) ?? true
  );

  const toggleNotSelectedVisibility = () => {
    setCommunityVisibilityForCommunities(nonSelectedCommunityIds, !anyNotSelectedVisible);
  };

  useEffect(() => {
    if (selectedZone !== null && communityVisibility.get(selectedZone) === false) {
      setCommunityVisibility(selectedZone, true);
    }
  }, [communityVisibility, selectedZone, setCommunityVisibility]);

  const handleRadioChange = (communityId: number, _color: string) => {
    selectCommunity(communityId);
  };

  const handleAddCommunity = () => {
    if (communities.length >= COI_MAX_COMMUNITIES) return;
    addCommunity();
  };

  const handleRemoveCommunity = (communityId: number) => {
    setCommunityToRemove(communityId);
  };

  const handleConfirmRemove = () => {
    if (communityToRemove !== null) {
      removeCommunity(communityToRemove);
      setCommunityToRemove(null);
    }
  };

  const handleUpdateCommunity = (
    communityId: number,
    updates: {name?: string; description?: string; color?: string}
  ) => {
    updateCommunity(communityId, updates);
  };

  const isReadOnly = access === 'read';
  const canRemove = communities.length > COI_MIN_COMMUNITIES;

  return (
    <Box
      className={isReadOnly ? 'pointer-events-none opacity-50' : ''}
      data-testid="zone-picker"
      maxWidth="100%"
    >
      <Flex direction="column" gap="2">
        {communities.length > 1 && (
          <Flex direction="row" justify="end" pr="3">
            <IconButton size="1" variant="ghost" onClick={toggleNotSelectedVisibility}>
              {anyNotSelectedVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
            </IconButton>
          </Flex>
        )}
        <CoiPicker
          onValueChange={handleRadioChange}
          defaultValue={selectedZone}
          value={selectedZone}
          communityList={communities}
          isReadOnly={isReadOnly}
          canRemove={canRemove}
          availableColors={availableCommunityColors}
          communityNameLengthLimit={communityNameLengthLimit}
          onRemoveCommunity={handleRemoveCommunity}
          onUpdateCommunity={handleUpdateCommunity}
        />
        {!isReadOnly && (
          <Flex justify="center">
            <IconButton
              size="1"
              variant="soft"
              onClick={handleAddCommunity}
              disabled={communities.length >= COI_MAX_COMMUNITIES}
              aria-label="Add community"
            >
              <PlusIcon />
            </IconButton>
          </Flex>
        )}
      </Flex>
      <AlertDialog.Root
        open={communityToRemove !== null}
        onOpenChange={open => {
          if (!open) setCommunityToRemove(null);
        }}
      >
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Remove Community</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure? This will permanently delete this community, its painted areas, and its
            comments. Your paint undo/redo history will also be cleared. This cannot be undone.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" onClick={() => setCommunityToRemove(null)}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={handleConfirmRemove}>
                Remove Community
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Box>
  );
};
