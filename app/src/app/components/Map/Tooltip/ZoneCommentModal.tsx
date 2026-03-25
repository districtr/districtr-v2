'use client';
import {Dialog, Flex, Button} from '@radix-ui/themes';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneDescriptionContent} from '@/app/components/ZoneComments/ZoneCommentsContent';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

export const ZoneCommentModal: React.FC = () => {
  const zoneCommentModalZone = useTooltipStore(state => state.zoneCommentModalZone);
  const setZoneCommentModalZone = useTooltipStore(state => state.setZoneCommentModalZone);
  const isEditing = useMapControlsStore(state => state.isEditing);

  const getZoneColor = useZoneColorGetter();
  const color = zoneCommentModalZone ? getZoneColor(zoneCommentModalZone) : undefined;

  if (zoneCommentModalZone === null) return null;

  return (
    <Dialog.Root
      open={zoneCommentModalZone !== null}
      onOpenChange={open => !open && setZoneCommentModalZone(null)}
    >
      <Dialog.Content style={{maxWidth: 400}}>
        <ZoneDescriptionContent
          zone={zoneCommentModalZone}
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

export default ZoneCommentModal;
