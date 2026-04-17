import React, {useState} from 'react';
import {NullableZone} from '@constants/map/zone';
import type {Community} from '@/app/utils/api/apiHandlers/types';
import {Box, Flex, RadioGroup, Text, IconButton} from '@radix-ui/themes';
import {EyeClosedIcon, EyeOpenIcon, Pencil1Icon, Cross2Icon} from '@radix-ui/react-icons';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {styled} from '@stitches/react';
import {EditCommunityDialog} from './EditCommunityDialog';
import {Tooltip} from '@radix-ui/themes';

const StyledRadioGroupItem = styled(RadioGroup.Item, {
  borderRadius: '37.5%',
  width: '1.5rem',
  height: '1.5rem',
  border: 'var(--border-width) solid var(--gray-200)',
  cursor: 'pointer',
  flexShrink: 0,
  '&::after': {
    borderRadius: '37.5%',
    width: '1.5rem',
    height: '1.5rem',
  },
  '&::before': {
    borderRadius: '37.5%',
    background: 'none',
    width: '1.5rem',
    height: '1.5rem',
  },
});

const CoiRadioRow: React.FC<{
  community: Community;
  disabled: boolean;
  isVisible: boolean;
  isSelected: boolean;
  isReadOnly: boolean;
  canRemove: boolean;
  availableColors: string[];
  onToggleVisibility: () => void;
  onSelect: (value: string) => void;
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
  onToggleVisibility,
  onSelect,
  onRemove,
  onUpdate,
}) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  return (
    <>
      <EditCommunityDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mode="edit"
        defaultName={community.name}
        defaultDescription={community.description}
        defaultColor={community.color}
        availableColors={availableColors}
        onSubmit={({name, description, color}) => {
          onUpdate({name, description, color});
          setEditDialogOpen(false);
        }}
      />
      <Flex direction="row" align="center" gap="2" py="1" maxWidth={'100%'}>
        <StyledRadioGroupItem
          style={{backgroundColor: community.color}}
          value={String(community.id)}
          disabled={disabled}
          className={disabled ? 'opacity-25' : ''}
        />
        <Box flexGrow={'0'} flexShrink="0" mr="2">
          <Text size="2" weight={isSelected ? 'bold' : 'regular'}>
            {community.name}
          </Text>
        </Box>
        <Box className="overflow-hidden" flexGrow="1">
          <Tooltip content={community.description}>
            <Text size="2" color="gray" truncate>
              {community.description}
            </Text>
          </Tooltip>
        </Box>
        {!isReadOnly && (
          <Tooltip content="Edit community name, description, and map color">
            <IconButton
              size="1"
              variant="ghost"
              onClick={() => {
                onSelect(String(community.id));
                setEditDialogOpen(true);
              }}
              aria-label="Edit community"
              className="flex-0"
            >
              <Pencil1Icon />
            </IconButton>
          </Tooltip>
        )}
        <IconButton size="1" variant="ghost" onClick={onToggleVisibility} disabled={isSelected}>
          <Tooltip content={isVisible ? 'Show community' : 'Hide community'}>
            {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </Tooltip>
        </IconButton>
        {!isReadOnly && canRemove && (
          <Tooltip content="Remove community">
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
          </Tooltip>
        )}
      </Flex>
    </>
  );
};

export const CoiRadioGroup: React.FC<{
  communities: Community[];
  disabledValues: NullableZone[];
  value?: number;
  defaultValue: number;
  isReadOnly?: boolean;
  canRemove?: boolean;
  onSelect: (value: string) => void;
  availableColors?: string[];
  onRemoveCommunity?: (communityId: number) => void;
  onUpdateCommunity?: (
    communityId: number,
    updates: {name?: string; description?: string; color?: string}
  ) => void;
}> = ({
  communities,
  disabledValues,
  value,
  defaultValue,
  isReadOnly = false,
  canRemove = true,
  availableColors = [],
  onSelect,
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
            onSelect={onSelect}
            onToggleVisibility={() => handleToggleVisibility(community.id)}
            onRemove={() => onRemoveCommunity?.(community.id)}
            onUpdate={updates => onUpdateCommunity?.(community.id, updates)}
          />
        );
      })}
    </>
  );
};
