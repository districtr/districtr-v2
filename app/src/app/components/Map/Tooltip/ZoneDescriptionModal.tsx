'use client';
import {Dialog, Flex, Button} from '@radix-ui/themes';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneDescriptionContent} from '@/app/components/ZoneDescriptions/ZoneDescriptionContent';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

export const ZoneDescriptionModal: React.FC = () => {
  const zoneDescriptionModalZone = useTooltipStore(state => state.zoneDescriptionModalZone);
  const setZoneDescriptionModalZone = useTooltipStore(state => state.setZoneDescriptionModalZone);
  const isEditing = useMapControlsStore(state => state.isEditing);

  const getZoneColor = useZoneColorGetter();
  const color = zoneDescriptionModalZone ? getZoneColor(zoneDescriptionModalZone) : undefined;

  if (zoneDescriptionModalZone === null) return null;

  return (
    <Dialog.Root
      open={zoneDescriptionModalZone !== null}
      onOpenChange={open => !open && setZoneDescriptionModalZone(null)}
    >
      <Dialog.Content style={{maxWidth: 400}}>
        <ZoneDescriptionContent
          zone={zoneDescriptionModalZone}
          color={color!}
          showEditingControls={isEditing}
        />
        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default ZoneDescriptionModal;
