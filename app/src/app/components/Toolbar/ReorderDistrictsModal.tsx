'use client';
import {useEffect, useState} from 'react';
import {Box, Button, Dialog, Flex, IconButton, Text} from '@radix-ui/themes';
import {ChevronDownIcon, ChevronUpIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useZoneOrder} from '@/app/hooks/useZoneLabel';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useZoneRowDrag, ZoneDragHandle} from '../sidebar/PopulationPanel/ZoneRowControls';

/**
 * Reorder districts from the Map actions menu. Saving renumbers them: the
 * district in row N becomes district N and takes that row's color, keeping its
 * label, description and painted areas (see mapStore.reorderZones).
 */
export const ReorderDistrictsModal: React.FC<{open: boolean; onClose: () => void}> = ({
  open,
  onClose,
}) => {
  const order = useZoneOrder();
  const colorScheme = useColorScheme();
  const aliases = useMapStore(state => state.mapDocument?.map_metadata?.zone_aliases);
  const reorderZones = useMapStore(state => state.reorderZones);
  const [draft, setDraft] = useState<number[]>(order);
  // The draft loads once per opening, like the color dialog's.
  useEffect(() => {
    if (open) setDraft(order);
  }, [open]);
  const drag = useZoneRowDrag(draft, setDraft);
  const move = (from: number, to: number) => {
    const next = [...draft];
    next.splice(to, 0, ...next.splice(from, 1));
    setDraft(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <Dialog.Content maxWidth="420px">
        <Dialog.Title size="4">Reorder districts</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          Drag districts into a new order. Each district takes its row&apos;s number and color, and
          keeps its label, description and painted areas.
        </Dialog.Description>
        <Flex direction="column" mt="3" className="max-h-[60vh] overflow-y-auto">
          {draft.map((zone, i) => {
            const alias = aliases?.[zone];
            return (
              <Flex
                key={zone}
                align="center"
                gap="2"
                px="2"
                className="rounded hover:bg-[var(--gray-2)]"
                style={{minHeight: 36, ...drag.rowStyle(zone)}}
                data-reorder-row
                {...drag.rowProps(zone)}
              >
                <ZoneDragHandle
                  zone={zone}
                  rowSelector="[data-reorder-row]"
                  onDragStart={drag.setDragZone}
                  onDragEnd={drag.endDrag}
                />
                <Text
                  size="2"
                  weight="bold"
                  style={{width: '3ch', fontVariantNumeric: 'tabular-nums'}}
                >
                  {i + 1}
                </Text>
                {/* The color stays with the row. */}
                <Box
                  aria-hidden
                  className="size-4 shrink-0 rounded-sm"
                  style={{backgroundColor: colorScheme[order[i] - 1]}}
                />
                <Text size="2" className="flex-1 truncate">
                  {alias}
                </Text>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  disabled={i === 0}
                  aria-label={`Move ${alias ?? `district ${zone}`} up`}
                  onClick={() => move(i, i - 1)}
                >
                  <ChevronUpIcon />
                </IconButton>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  disabled={i === draft.length - 1}
                  aria-label={`Move ${alias ?? `district ${zone}`} down`}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronDownIcon />
                </IconButton>
              </Flex>
            );
          })}
        </Flex>
        <Flex justify="end" gap="2" mt="4">
          <Button variant="soft" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              reorderZones(draft);
              onClose();
            }}
          >
            Save
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
