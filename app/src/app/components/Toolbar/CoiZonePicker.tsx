import React, {useEffect, useMemo, useState} from 'react';
import {Box, Flex, Button} from '@radix-ui/themes';
import {EyeOpenIcon, EyeClosedIcon} from '@radix-ui/react-icons';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {CoiPicker} from './CoiPicker';
import {AddCommunityDialog} from './AddCommunityDialog';
import {COI_MIN_COMMUNITIES, COI_MAX_COMMUNITIES} from '@/app/constants/map/mapDefaults';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useSelectCommunity} from '@/app/hooks/useSelectCommunity';
import {getNextCommunityName, getUnusedCommunityColors} from '@/app/utils/communities';

export const CoiZonePicker: React.FC = () => {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const communities = useMapStore(state => state.communities);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const colorScheme = useColorScheme();

  const addCommunity = useMapStore(state => state.addCommunity);
  const removeCommunity = useMapStore(state => state.removeCommunity);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const setCommunityVisibilityForCommunities = useCoiAssignmentsStore(
    state => state.setCommunityVisibilityForCommunities
  );
  const selectCommunity = useSelectCommunity();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const nonSelectedCommunityIds = communities
    .map(community => community.id)
    .filter(communityId => communityId !== selectedZone);
  const defaultCommunityName = useMemo(() => getNextCommunityName(communities), [communities]);
  const availableCommunityColors = useMemo(
    () => getUnusedCommunityColors(communities, colorScheme),
    [communities, colorScheme]
  );
  const defaultCommunityColor = availableCommunityColors[0] ?? colorScheme[0] ?? '#000000';
  const anyNotSelectedVisible = nonSelectedCommunityIds.some(
    communityId => communityVisibility.get(communityId) ?? true
  );

  const toggleNotSelectedVisibility = () => {
    setCommunityVisibilityForCommunities(nonSelectedCommunityIds, !anyNotSelectedVisible);
  };

  useEffect(() => {
    // The selected community should always stay visible.
    if (selectedZone !== null && communityVisibility.get(selectedZone) === false) {
      setCommunityVisibility(selectedZone, true);
    }
  }, [communityVisibility, selectedZone, setCommunityVisibility]);

  const handleRadioChange = (communityId: number, _color: string) => {
    selectCommunity(communityId);
  };

  const openAddCommunityDialog = () => {
    if (communities.length >= COI_MAX_COMMUNITIES) return;
    setIsAddDialogOpen(true);
  };

  const handleIncreaseCommunities = () => {
    openAddCommunityDialog();
  };

  const handleCreateCommunity = ({
    name,
    description,
    color,
  }: {
    name: string;
    description: string;
    color: string;
  }) => {
    addCommunity({name, description, color});
    setIsAddDialogOpen(false);
  };

  const isReadOnly = access === 'read';
  const canEditNumCommunities = !isReadOnly;

  return (
    <Box className={isReadOnly ? 'pointer-events-none opacity-50' : ''} data-testid="zone-picker">
      <Flex direction="column" gap="2">
        {canEditNumCommunities && (
          <Flex direction="row" justify="between" align="center">
            <Flex gap="2">
              <Button
                size="1"
                variant="soft"
                onClick={handleIncreaseCommunities}
                disabled={isReadOnly || communities.length >= COI_MAX_COMMUNITIES}
              >
                Add Community
              </Button>
              <Button
                size="1"
                variant="soft"
                color="red"
                onClick={() => removeCommunity(selectedZone)}
                disabled={isReadOnly || communities.length <= COI_MIN_COMMUNITIES}
              >
                Remove Community
              </Button>
            </Flex>
            <Button size="1" variant="ghost" onClick={toggleNotSelectedVisibility}>
              {anyNotSelectedVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
            </Button>
          </Flex>
        )}
        <CoiPicker
          onValueChange={handleRadioChange}
          defaultValue={selectedZone}
          value={selectedZone}
          communityList={communities}
        />
      </Flex>
      <AddCommunityDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={handleCreateCommunity}
        defaultName={defaultCommunityName}
        defaultColor={defaultCommunityColor}
        availableColors={availableCommunityColors}
      />
    </Box>
  );
};
