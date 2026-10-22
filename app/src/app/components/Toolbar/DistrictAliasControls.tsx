'use client';
import {useEffect, useState} from 'react';
import {Button, Flex, IconButton, Popover, Text, TextField, Tooltip} from '@radix-ui/themes';
import {ShuffleIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {FALLBACK_NUM_DISTRICTS, ZONE_ALIAS_MAX_LENGTH} from '@/app/constants/document/limits';

/** Name the selected district, or swap its number with another district's. */
export const DistrictAliasControls: React.FC = () => {
  const selectedZone = useMapControlsStore(state => state.selectedZone);
  const alias = useMapStore(state => state.mapDocument?.map_metadata?.zone_aliases?.[selectedZone]);
  const numDistricts = useMapStore(
    state => state.mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS
  );
  const setZoneAlias = useMapStore(state => state.setZoneAlias);
  const renumberZones = useAssignmentsStore(state => state.renumberZones);
  const mapLock = useMapStore(state => state.mapLock);
  const [draftAlias, setDraftAlias] = useState(alias ?? '');
  const [target, setTarget] = useState('');

  useEffect(() => {
    setDraftAlias(alias ?? '');
  }, [alias, selectedZone]);

  const commitAlias = () => {
    if (draftAlias.trim() !== (alias ?? '')) setZoneAlias(selectedZone, draftAlias);
  };

  const targetZone = parseInt(target, 10);
  const validTarget =
    Number.isInteger(targetZone) &&
    targetZone >= 1 &&
    targetZone <= numDistricts &&
    targetZone !== selectedZone;
  const swap = () => {
    if (!validTarget || mapLock) return;
    // ponytail: swaps only; any reordering is a sequence of swaps.
    renumberZones(
      new Map([
        [selectedZone, targetZone],
        [targetZone, selectedZone],
      ])
    );
    setTarget('');
  };

  return (
    <Flex align="center" gap="2">
      <Text size="2" weight="medium" className="whitespace-nowrap">
        District {selectedZone}
      </Text>
      <TextField.Root
        size="1"
        variant="soft"
        placeholder="Add a name"
        aria-label={`Name for district ${selectedZone}`}
        value={draftAlias}
        maxLength={ZONE_ALIAS_MAX_LENGTH}
        onChange={e => setDraftAlias(e.target.value)}
        onBlur={commitAlias}
        onKeyUp={e => e.key === 'Enter' && e.currentTarget.blur()}
        className="flex-grow min-w-0"
      />
      <Popover.Root onOpenChange={open => !open && setTarget('')}>
        <Tooltip content="Renumber this district">
          <Popover.Trigger>
            <IconButton variant="ghost" size="1" aria-label={`Renumber district ${selectedZone}`}>
              <ShuffleIcon />
            </IconButton>
          </Popover.Trigger>
        </Tooltip>
        <Popover.Content size="1" maxWidth="260px">
          <Flex direction="column" gap="2">
            <Text size="1" color="gray">
              Swap numbers with another district. Its color, name, description, and lock move with
              it.
            </Text>
            <Flex align="center" gap="2">
              <Text size="2" className="whitespace-nowrap">
                {selectedZone} ↔
              </Text>
              <TextField.Root
                type="number"
                size="1"
                min={1}
                max={numDistricts}
                value={target}
                aria-label="New district number"
                onChange={e => setTarget(e.target.value)}
                onKeyUp={e => e.key === 'Enter' && swap()}
                className="w-16"
              />
              <Popover.Close>
                <Button size="1" disabled={!validTarget || !!mapLock} onClick={swap}>
                  Swap
                </Button>
              </Popover.Close>
            </Flex>
          </Flex>
        </Popover.Content>
      </Popover.Root>
    </Flex>
  );
};
