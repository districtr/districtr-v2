'use client';
import {Flex, IconButton, Badge, Box, Popover} from '@radix-ui/themes';
import {ChatBubbleIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useState} from 'react';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ZoneDescriptionContent} from '@/app/components/ZoneComments/ZoneCommentsContent';

interface ZoneCommentPopoverProps {
  zone: number;
  color: string;
  disabled?: boolean;
}

export const ZoneCommentPopover: React.FC<ZoneCommentPopoverProps> = ({zone, color, disabled}) => {
  const [isOpen, setIsOpen] = useState(false);

  const description = useMapStore(state => state.getZoneDescriptionForZone(zone));
  const isEditing = useMapControlsStore(state => state.isEditing);
  const selectedZone = useMapControlsStore(state => state.selectedZone);

  const hasDescription = !!description;
  const shouldShowPublic = !isEditing && hasDescription;
  const shouldShowEditing = isEditing && (hasDescription || selectedZone === zone);

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
          {hasDescription && (
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
        <ZoneDescriptionContent
          zone={zone}
          color={color}
          showEditingControls={isEditing}
        />
      </Popover.Content>
    </Popover.Root>
  );
};

export default ZoneCommentPopover;
