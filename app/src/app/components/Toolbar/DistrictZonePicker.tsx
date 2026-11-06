import React, {useEffect, useState} from 'react';
import {
  Box,
  Flex,
  Button,
  Text,
  TextField,
  IconButton,
  Tooltip,
  AlertDialog,
} from '@radix-ui/themes';
import {useMapStore} from '../../store/mapStore';
import {useMapControlsStore} from '../../store/mapControlsStore';
import {useAssignmentsStore} from '../../store/assignmentsStore';
import {ColorPicker} from './ColorPicker';
import {
  FALLBACK_NUM_DISTRICTS,
  MAX_NUM_DISTRICTS,
  MIN_NUM_DISTRICTS,
} from '@/app/constants/document/limits';
import {MinusIcon, PlusIcon, Pencil1Icon} from '@radix-ui/react-icons';
import {ACCESS_STATES} from '@constants/document/state';
import {temporalManager} from '@/app/utils/temporal';
import {MAP_MODES} from '@constants/map/mode';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useZoneLabelGetter, useZoneOrder} from '@/app/hooks/useZoneLabel';

const LISTED_LABELS = 10;
/** "A, B and C"; past LISTED_LABELS, "A, …, J and 12 more". */
const listLabels = (labels: string[]) => {
  const shown = labels.slice(0, LISTED_LABELS);
  const rest = labels.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown[0];
};

export const DistrictsZonePicker: React.FC<{disabled?: boolean}> = ({disabled}) => {
  const superDraw = useToolbarStore(state => state.superDraw);
  const [showNumDistrictEditor, setShowNumDistrictEditor] = useState(false);
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);
  const access = useMapStore(state => state.mapStatus?.access);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setNumDistricts = useMapStore(state => state.setNumDistricts);
  const zoneOrder = useZoneOrder();
  const getZoneLabel = useZoneLabelGetter();

  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
  const numDistrictsModifiable = mapDocument?.num_districts_modifiable !== false;

  // Draft text for the count input; only committed on blur/Enter so the user
  // can clear the field while typing a new value.
  const [draftCount, setDraftCount] = useState(String(numDistricts));
  // A requested decrease that would delete assignments, awaiting confirmation.
  const [pendingDecrease, setPendingDecrease] = useState<number | null>(null);

  useEffect(() => {
    setDraftCount(String(numDistricts));
  }, [numDistricts]);

  const handleRadioChange = (index: number, _color: string) => {
    const value = index + 1;
    setSelectedZone(value);
  };

  const commitNumDistricts = (newNumDistricts: number) => {
    // Lowering removes the panel's last rows and their assignments.
    setNumDistricts(newNumDistricts);
    if (newNumDistricts < numDistricts) {
      // num_districts isn't part of the undo/redo history, so rewinding could
      // resurrect assignments in zones that no longer exist. Clear history at
      // this boundary — the dialog already tells the user this can't be undone.
      temporalManager.clear(MAP_MODES.DISTRICTS);
    }
  };

  /** Clamps and applies a requested count. Returns the committed value, or
   * null when nothing changed yet (no-op, or deferred to the confirm dialog). */
  const requestNumDistricts = (requested: number): number | null => {
    const clamped = Math.max(MIN_NUM_DISTRICTS, Math.min(MAX_NUM_DISTRICTS, requested));
    if (clamped === numDistricts) return null;
    if (clamped < numDistricts) {
      // Ask before removing assignments or labels.
      const removed = new Set(zoneOrder.slice(clamped));
      const aliases = mapDocument?.map_metadata?.zone_aliases ?? {};
      let hasAssignments = false;
      useAssignmentsStore.getState().zoneAssignments.forEach(zone => {
        if (zone !== null && removed.has(zone)) hasAssignments = true;
      });
      if (hasAssignments || [...removed].some(zone => aliases[zone])) {
        setPendingDecrease(clamped);
        return null;
      }
    }
    commitNumDistricts(clamped);
    return clamped;
  };

  const removedLabels =
    pendingDecrease === null ? [] : zoneOrder.slice(pendingDecrease).map(getZoneLabel);

  const handleCommitDraft = () => {
    const parsed = parseInt(draftCount, 10);
    if (isNaN(parsed)) {
      setDraftCount(String(numDistricts));
      return;
    }
    const committed = requestNumDistricts(parsed);
    // Sync the draft to the value just committed; on a no-op or a change
    // pending confirmation, snap back to the still-current count.
    setDraftCount(String(committed ?? numDistricts));
  };

  const isReadOnly = access === ACCESS_STATES.READ;
  const canEditNumDistricts = numDistrictsModifiable && !isReadOnly;

  return (
    <Box
      className={isReadOnly || disabled ? 'pointer-events-none opacity-50' : ''}
      data-testid="zone-picker"
      width="100%"
    >
      <Flex direction="column" gap="2">
        {superDraw && (
          <Flex align="center" gap="2">
            <Text size="2" weight="medium">
              Districts:
            </Text>
            {canEditNumDistricts && showNumDistrictEditor ? (
              <>
                <Button
                  variant="ghost"
                  size="1"
                  onClick={() => requestNumDistricts(numDistricts - 1)}
                  disabled={numDistricts <= MIN_NUM_DISTRICTS}
                >
                  <MinusIcon />
                </Button>
                <TextField.Root
                  type="number"
                  min={MIN_NUM_DISTRICTS}
                  max={MAX_NUM_DISTRICTS}
                  value={draftCount}
                  variant="soft"
                  size="1"
                  onChange={e => setDraftCount(e.target.value)}
                  // Only Enter commits; clicking away abandons the edit.
                  onBlur={() => setDraftCount(String(numDistricts))}
                  // Commit on keyup, not keydown: keydown fires on OS key-repeat,
                  // and once the confirm dialog opens (auto-focusing Cancel) a
                  // repeated Enter would land on Cancel and silently dismiss it.
                  onKeyUp={e => {
                    if (e.key === 'Enter') {
                      handleCommitDraft();
                    } else if (e.key === 'Escape') {
                      e.currentTarget.blur();
                    }
                  }}
                  mx={'1'}
                  className="text-center min-w-12 pr-2"
                ></TextField.Root>
                <Button
                  variant="ghost"
                  size="1"
                  onClick={() => requestNumDistricts(numDistricts + 1)}
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
        )}
        <ColorPicker
          onValueChange={handleRadioChange}
          defaultValue={0}
          value={selectedZone - 1}
          disabled={disabled}
        />
      </Flex>
      <AlertDialog.Root
        open={pendingDecrease !== null}
        onOpenChange={open => !open && setPendingDecrease(null)}
      >
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Reduce number of districts</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Reducing your plan to {pendingDecrease} districts removes the last{' '}
            {removedLabels.length === 1 ? 'district' : `${removedLabels.length} districts`} in the
            population list, with their assignments and labels: {listLabels(removedLabels)}. To keep
            a district, drag it higher in the list first. This cannot be undone.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={() => {
                  if (pendingDecrease !== null) commitNumDistricts(pendingDecrease);
                  setPendingDecrease(null);
                }}
              >
                Remove districts
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Box>
  );
};
