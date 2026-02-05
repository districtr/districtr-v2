import React from 'react';
import {Box, Flex, Button, Text, TextField, IconButton, Tooltip} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {useAssignmentsStore} from '../../store/assignmentsStore';
import {ColorPicker} from './ColorPicker';
import {FALLBACK_NUM_DISTRICTS, MAX_NUM_DISTRICTS, MIN_NUM_DISTRICTS} from '@/app/constants/mapDefaults';
import {MinusIcon, PlusIcon, Pencil1Icon} from '@radix-ui/react-icons';
import {useState} from 'react';

export function ZonePicker() {
  const [showNumDistrictEditor, setShowNumDistrictEditor] = useState(false);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setNumDistricts = useMapStore(state => state.setNumDistricts);
  const removeAssignmentsForZonesAbove = useAssignmentsStore(
    state => state.removeAssignmentsForZonesAbove
  );

  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
  const numDistrictsModifiable = mapDocument?.num_districts_modifiable !== false;

  const handleRadioChange = (index: number, _color: string) => {
    const value = index + 1;
    setSelectedZone(value);
  };

  const handleIncreaseDistricts = () => {
    const newNumDistricts = numDistricts + 1;
    setNumDistricts(newNumDistricts);
  };

  const handleDecreaseDistricts = () => {
    if (numDistricts <= MIN_NUM_DISTRICTS) return;
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
  const canEditNumDistricts = numDistrictsModifiable && !isReadOnly;

  return (
    <Box className={isReadOnly ? 'pointer-events-none opacity-50' : ''}
    data-testid="zone-picker"
    >
      <Flex direction="column" gap="2">
        <Flex align="center" gap="2">
          <Text size="2" weight="medium">
            Districts:
          </Text>
          {canEditNumDistricts && showNumDistrictEditor ? (
            <>
              <Button
                variant="ghost"
                size="1"
                onClick={handleDecreaseDistricts}
                disabled={numDistricts <= MIN_NUM_DISTRICTS}
              >
                <MinusIcon />
              </Button>
              <TextField.Root
                type="number"
                min={2}
                max={MAX_NUM_DISTRICTS}
                value={numDistricts}
                variant="soft"
                size="1"
                onChange={e => {
                  const val = Math.max(MIN_NUM_DISTRICTS, Math.min(MAX_NUM_DISTRICTS, Number(e.target.value)));
                  if (!isNaN(val)) {
                    setNumDistricts(val);
                  }
                }}
                mx={"1"}
                className="text-center min-w-12 pr-2"
              ></TextField.Root>
              <Button
                variant="ghost"
                size="1"
                onClick={handleIncreaseDistricts}
                disabled={numDistricts >= MAX_NUM_DISTRICTS}
              >
                <PlusIcon />
              </Button>
            </>
          ) : (
            <>
              <Text size="2" weight="bold">
                {numDistricts}
              </Text>
              {canEditNumDistricts && (
                <Tooltip content="Edit the number of districts in your plan">
                  <IconButton
                    variant="ghost"
                    onClick={() => setShowNumDistrictEditor(true)}
                    aria-label="Edit the number of districts in your plan"
                  >
                    <Pencil1Icon />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </Flex>
        <ColorPicker onValueChange={handleRadioChange} defaultValue={0} value={selectedZone - 1} />
      </Flex>
    </Box>
  );
}
