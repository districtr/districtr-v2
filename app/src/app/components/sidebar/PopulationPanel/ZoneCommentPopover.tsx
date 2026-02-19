'use client';
import {
  Flex,
  Button,
  IconButton,
  Badge,
  Box,
  Popover,
} from '@radix-ui/themes';
import {ChatBubbleIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useState} from 'react';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneCommentsContent} from '@/app/components/ZoneComments/ZoneCommentsContent';

interface ZoneCommentPopoverProps {
  zone: number;
  color: string;
  disabled?: boolean;
}

export const ZoneCommentPopover: React.FC<ZoneCommentPopoverProps> = ({
  zone,
  color,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const isEditing = useMapControlsStore(state => state.isEditing);
  const selectedZone = useMapControlsStore(state => state.selectedZone);

  const commentCount = comments.length;
  const shouldShowPublic = !isEditing && commentCount > 0;
  const shouldShowEditing =
    isEditing && (commentCount > 0 || selectedZone === zone);

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <IconButton
          variant="ghost"
          size="1"
          className={`relative mr-2
            ${shouldShowPublic || shouldShowEditing ? 'opacity-100' : 'opacity-0'}
            ${isEditing && 'hover:opacity-100'}
            transition-opacity duration-200
          `}
          disabled={disabled}
        >
          <ChatBubbleIcon />
          {commentCount > 0 && (
            <Badge
              size="1"
              variant="solid"
              className="absolute top-0 right-0 min-w-[8px] h-[8px] p-0 flex items-center justify-center text-[10px] rounded-full"
              style={{
                backgroundColor: color,
              }}
            />
          )}
        </IconButton>
      </Popover.Trigger>
      <Popover.Content style={{width: 300}} align="start">
        <ZoneCommentsContent
          zone={zone}
          color={color}
          showEditingControls={isEditing}
          showAddButton={isEditing}
          scrollMaxHeight={250}
        />
      </Popover.Content>
    </Popover.Root>
  );
};

export default ZoneCommentPopover;
