import React, {useState, useRef, useEffect} from 'react';
import {NullableZone} from '@/app/constants/types';
import type {Community} from '@/app/utils/api/apiHandlers/types';
import {Box, Flex, RadioGroup, Text, Button, IconButton, Popover, TextField, TextArea} from '@radix-ui/themes';
import {EyeClosedIcon, EyeOpenIcon, Pencil1Icon, Cross2Icon, CheckIcon} from '@radix-ui/react-icons';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {DEFAULT_COMMUNITY_DESCRIPTION} from '@/app/utils/communities';
import {styled} from '@stitches/react';

const StyledRadioGroupItem = styled(RadioGroup.Item, {
  borderRadius: 4,
  width: '1.5rem',
  height: '1.5rem',
  border: 'var(--border-width) solid var(--gray-200)',
  cursor: 'pointer',
  flexShrink: 0,
  '&::after': {
    borderRadius: 4,
    width: '1.5rem',
    height: '1.5rem',
  },
  '&::before': {
    borderRadius: 4,
    background: 'none',
    width: '1.5rem',
    height: '1.5rem',
  },
});

const InlineColorPicker: React.FC<{
  currentColor: string;
  availableColors: string[];
  onColorChange: (color: string) => void;
  disabled?: boolean;
}> = ({currentColor, availableColors, onColorChange, disabled}) => {
  const [open, setOpen] = useState(false);
  const colors = Array.from(new Set([currentColor, ...availableColors])).slice(0, 24);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          type="button"
          disabled={disabled}
          aria-label="Change community color"
          className="rounded border border-gray-300 cursor-pointer hover:scale-105 transition-transform"
          style={{
            backgroundColor: currentColor,
            width: '1.5rem',
            height: '1.5rem',
            flexShrink: 0,
          }}
          onClick={e => {
            e.stopPropagation();
            setOpen(o => !o);
          }}
        />
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        sideOffset={4}
        align="start"
        style={{width: 240, zIndex: 1000}}
        onPointerDownOutside={() => setOpen(false)}
      >
        <Flex wrap="wrap" gap="2">
          {colors.map(color => {
            const isSelected = color.toLowerCase() === currentColor.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                aria-label={`Select color ${color}`}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
                  isSelected ? 'border-black shadow-sm' : 'border-gray-300'
                }`}
                style={{backgroundColor: color}}
                onClick={() => {
                  onColorChange(color);
                  setOpen(false);
                }}
              >
                {isSelected && <CheckIcon className="text-white drop-shadow" />}
              </button>
            );
          })}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};

const CoiRadioRow: React.FC<{
  community: Community;
  disabled: boolean;
  isVisible: boolean;
  isSelected: boolean;
  isReadOnly: boolean;
  canRemove: boolean;
  availableColors: string[];
  communityNameLengthLimit: number;
  onToggleVisibility: () => void;
  onRemove: () => void;
  onUpdate: (updates: {name?: string; description?: string; color?: string}) => void;
}> = ({
  community,
  disabled,
  isVisible,
  isSelected,
  isReadOnly,
  canRemove,
  availableColors,
  communityNameLengthLimit,
  onToggleVisibility,
  onRemove,
  onUpdate,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(community.name);
  const [editDescription, setEditDescription] = useState(community.description);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditName(community.name);
    setEditDescription(community.description);
  }, [community.name, community.description]);

  const handleStartEditing = () => {
    if (isReadOnly) return;
    setEditName(community.name);
    setEditDescription(community.description);
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmedName = editName.trim();
    const name = trimmedName || community.name;
    const description = editDescription;
    if (name !== community.name || description !== community.description) {
      onUpdate({name, description});
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(community.name);
    setEditDescription(community.description);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const descriptionPreview =
    community.description === DEFAULT_COMMUNITY_DESCRIPTION
      ? ''
      : community.description;

  const handleColorChange = (color: string) => {
    onUpdate({color});
  };

  if (isEditing) {
    return (
      <Flex direction="column" gap="1" py="1" px="1" className="border border-gray-200 rounded-md bg-gray-50">
        <Flex direction="row" align="center" gap="2">
          <InlineColorPicker
            currentColor={community.color}
            availableColors={availableColors}
            onColorChange={handleColorChange}
          />
          <Box className="flex-grow">
            <TextField.Root
              ref={nameInputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              maxLength={communityNameLengthLimit}
              onKeyDown={handleKeyDown}
              size="1"
              placeholder="Community name"
            />
          </Box>
        </Flex>
        <TextArea
          value={editDescription === DEFAULT_COMMUNITY_DESCRIPTION ? '' : editDescription}
          onChange={e => setEditDescription(e.target.value)}
          placeholder="Add a description..."
          rows={2}
          size="1"
          onKeyDown={handleKeyDown}
        />
        <Flex gap="1" justify="end">
          <Button size="1" variant="soft" color="gray" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="1" onClick={handleSave}>
            Save
          </Button>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex direction="row" align="start" gap="2" py="1">
      <Flex align="center" pt="1">
        <StyledRadioGroupItem
          style={{backgroundColor: community.color}}
          value={String(community.id)}
          disabled={disabled}
          className={disabled ? 'opacity-25' : ''}
        />
      </Flex>
      <Flex direction="column" className="flex-grow min-w-0">
        <Text size="2" weight={isSelected ? 'bold' : 'regular'} truncate>
          {community.name}
        </Text>
        {descriptionPreview && (
          <Text size="1" color="gray" truncate>
            {descriptionPreview}
          </Text>
        )}
      </Flex>
      <Flex align="center" gap="0" flexShrink="0" pt="1">
        {!isReadOnly && (
          <IconButton size="1" variant="ghost" onClick={handleStartEditing} aria-label="Edit community">
            <Pencil1Icon />
          </IconButton>
        )}
        <IconButton size="1" variant="ghost" onClick={onToggleVisibility} disabled={isSelected}>
          {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
        </IconButton>
        {!isReadOnly && canRemove && (
          <IconButton
            size="1"
            variant="ghost"
            color="red"
            onClick={e => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label="Remove community"
          >
            <Cross2Icon />
          </IconButton>
        )}
      </Flex>
    </Flex>
  );
};

export const CoiRadioGroup: React.FC<{
  communities: Community[];
  disabledValues: NullableZone[];
  value?: number;
  defaultValue: number;
  isReadOnly?: boolean;
  canRemove?: boolean;
  availableColors?: string[];
  communityNameLengthLimit?: number;
  onRemoveCommunity?: (communityId: number) => void;
  onUpdateCommunity?: (communityId: number, updates: {name?: string; description?: string; color?: string}) => void;
}> = ({
  communities,
  disabledValues,
  value,
  defaultValue,
  isReadOnly = false,
  canRemove = true,
  availableColors = [],
  communityNameLengthLimit = 40,
  onRemoveCommunity,
  onUpdateCommunity,
}) => {
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const currentlySelectedCommunityId = value ?? defaultValue;
  const handleToggleVisibility = (communityId: number) => {
    const prev = communityVisibility.get(communityId) ?? true;
    setCommunityVisibility(communityId, !prev);
  };
  return (
    <>
      {communities.map(community => {
        const isVisible = communityVisibility.get(community.id) ?? true;
        return (
          <CoiRadioRow
            key={community.id}
            community={community}
            disabled={disabledValues.includes(community.id)}
            isVisible={isVisible}
            isSelected={currentlySelectedCommunityId === community.id}
            isReadOnly={isReadOnly}
            canRemove={canRemove}
            availableColors={availableColors}
            communityNameLengthLimit={communityNameLengthLimit}
            onToggleVisibility={() => handleToggleVisibility(community.id)}
            onRemove={() => onRemoveCommunity?.(community.id)}
            onUpdate={updates => onUpdateCommunity?.(community.id, updates)}
          />
        );
      })}
    </>
  );
};
