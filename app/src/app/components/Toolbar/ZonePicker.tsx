import React from 'react';
import {Box, Flex, Button, Text, TextField} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {useAssignmentsStore} from '../../store/assignmentsStore';
import {ColorPicker} from './ColorPicker';
import {FALLBACK_NUM_DISTRICTS} from '../../constants/layers';
import {MinusIcon, PlusIcon} from '@radix-ui/react-icons';

export function ZonePicker() {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setNumDistricts = useMapStore(state => state.setNumDistricts);
  const removeAssignmentsForZonesAbove = useAssignmentsStore(
    state => state.removeAssignmentsForZonesAbove
  );

  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;

  const handleRadioChange = (index: number, _color: string) => {
    const value = index + 1;
    setSelectedZone(value);
  };

  const handleIncreaseDistricts = () => {
    const newNumDistricts = numDistricts + 1;
    setNumDistricts(newNumDistricts);
  };

  const handleDecreaseDistricts = () => {
    if (numDistricts <= 2) return;
    const newNumDistricts = numDistricts - 1;
    setNumDistricts(newNumDistricts);
    // Remove assignments for zones above the new max
    removeAssignmentsForZonesAbove(newNumDistricts);
    // If selected zone is now invalid, reset to zone 1
    if (selectedZone > newNumDistricts) {
      setSelectedZone(1);
    }
  };

  const isReadOnly = access === 'read';

  return (
    <Box className={isReadOnly ? 'pointer-events-none opacity-50' : ''}>
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <Text size="2" weight="medium">
            Districts:
          </Text>
          <Button
            variant="soft"
            size="1"
            onClick={handleDecreaseDistricts}
            disabled={isReadOnly || numDistricts <= 2}
          >
            <MinusIcon />
          </Button>
          <Text size="2" weight="bold" style={{minWidth: '4ch', textAlign: 'center', width: 'auto'}}>
            <TextField.Root
              type="number"
              min={2}
              max={538}
              value={numDistricts}
              disabled={isReadOnly}
              variant="soft"
              size="1"
              onChange={e => {
                const val = Math.max(2, Math.min(538, Number(e.target.value)));
                if (!isNaN(val)) {
                  setNumDistricts(val);
                }
              }}
            >
            </TextField.Root>
          </Text>
          <Button
            variant="soft"
            size="1"
            onClick={handleIncreaseDistricts}
            disabled={isReadOnly || numDistricts >= 538}
          >
            <PlusIcon />
          </Button>
        </Flex>
        <ColorPicker onValueChange={handleRadioChange} defaultValue={0} value={selectedZone - 1} />
      </Flex>
    </Box>
  );
}
