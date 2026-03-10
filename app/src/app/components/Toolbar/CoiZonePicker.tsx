import React from 'react';
import {Box, Flex, Button} from '@radix-ui/themes';
import {EyeClosedIcon, EyeOpenIcon} from '@radix-ui/react-icons';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {CoiPicker} from './CoiPicker';
import {COI_MIN_COMMUNITIES, COI_MAX_COMMUNITIES} from '@/app/constants/map/mapDefaults';

export const CoiZonePicker: React.FC = () => {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const coiCommunities = useMapStore(state => state.coiCommunities);
  const addCoiCommunity = useMapStore(state => state.addCoiCommunity);
  const removeCoiCommunity = useMapStore(state => state.removeCoiCommunity);

  const handleRadioChange = (communityId: number, _color: string) => {
    setSelectedZone(communityId);
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
