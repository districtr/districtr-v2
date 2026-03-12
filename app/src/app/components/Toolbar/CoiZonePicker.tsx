import React, {useEffect} from 'react';
import {Box, Flex, Button} from '@radix-ui/themes';
import {EyeOpenIcon, EyeClosedIcon} from '@radix-ui/react-icons';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {CoiPicker} from './CoiPicker';
import {COI_MIN_COMMUNITIES, COI_MAX_COMMUNITIES} from '@/app/constants/map/mapDefaults';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';

export const CoiZonePicker: React.FC = () => {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const coiCommunities = useMapStore(state => state.coiCommunities);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);

  const addCoiCommunity = useMapStore(state => state.addCoiCommunity);
  const removeCoiCommunity = useMapStore(state => state.removeCoiCommunity);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const setCommunityVisibilityForCommunities = useCoiAssignmentsStore(
    state => state.setCommunityVisibilityForCommunities
  );

  const nonSelectedCommunityIds = coiCommunities
    .map(community => community.id)
    .filter(communityId => communityId !== selectedZone);
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
    if (!anyNotSelectedVisible && communityId !== selectedZone) {
      const communitiesToHide = coiCommunities
        .map(community => community.id)
        .filter(id => id !== communityId);
      setCommunityVisibilityForCommunities(communitiesToHide, false);
    }
    setSelectedZone(communityId);
    setCommunityVisibility(communityId, true);
  };

  const handleIncreaseCommunities = () => {
    if (coiCommunities.length >= COI_MAX_COMMUNITIES) return;
    addCoiCommunity();
  };

  const isReadOnly = access === 'read';
  const canEditNumCommunities = !isReadOnly;

  return (
    <Box className={isReadOnly ? 'pointer-events-none opacity-50' : ''}>
      <Flex direction="column" gap="2">
        {canEditNumCommunities && (
          <Flex direction="row" justify="between" align="center">
            <Flex gap="2">
              <Button
                size="1"
                variant="soft"
                onClick={handleIncreaseCommunities}
                disabled={isReadOnly || coiCommunities.length >= COI_MAX_COMMUNITIES}
              >
                Add Community
              </Button>
              <Button
                size="1"
                variant="soft"
                color="red"
                onClick={() => removeCoiCommunity(selectedZone)}
                disabled={isReadOnly || coiCommunities.length <= COI_MIN_COMMUNITIES}
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
          communities={coiCommunities}
        />
      </Flex>
    </Box>
  );
};
