'use client';
import {Dialog, Flex, Box, Button} from '@radix-ui/themes';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneCommentsContent} from '@/app/components/ZoneComments/ZoneCommentsContent';
import {useMapStore} from '@/app/store/mapStore';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

export const ZoneCommentModal: React.FC = () => {
  const zoneCommentModalZone = useTooltipStore(state => state.zoneCommentModalZone);
  const setZoneCommentModalZone = useTooltipStore(state => state.setZoneCommentModalZone);
  const commentCountLimit = useMapStore(state => state.mapDocument?.comment_count_limit);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const comments = useMapStore(state =>
    zoneCommentModalZone ? state.getZoneCommentsForZone(zoneCommentModalZone) : []
  );

  const getZoneColor = useZoneColorGetter();
  const color = zoneCommentModalZone ? getZoneColor(zoneCommentModalZone) : undefined;

  if (zoneCommentModalZone === null) return null;

  return (
    <Dialog.Root
      open={zoneCommentModalZone !== null}
      onOpenChange={open => !open && setZoneCommentModalZone(null)}
    >
      <Dialog.Content style={{maxWidth: 400}}>
        <ZoneCommentsContent
          zone={zoneCommentModalZone}
          color={color!}
          showEditingControls={isEditing}
          showAddButton={isEditing && comments.length < (commentCountLimit ?? 0)}
          scrollMaxHeight={300}
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
