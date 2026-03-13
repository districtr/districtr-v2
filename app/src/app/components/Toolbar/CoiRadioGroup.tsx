import React from 'react';
import {NullableZone} from '@/app/constants/types';
import type {Community} from '@/app/utils/api/apiHandlers/types';
import {Flex, RadioGroup, Text, Button} from '@radix-ui/themes';
import {EyeClosedIcon, EyeOpenIcon} from '@radix-ui/react-icons';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {styled} from '@stitches/react';

const StyledRadioGroupItem = styled(RadioGroup.Item, {
  borderRadius: 8,
  width: '1.25rem',
  height: '1.25rem',
  border: 'var(--border-width) solid var(--gray-200)',
  '&::after': {
    borderRadius: 8,
    width: '1.25rem',
    height: '1.25rem',
  },
  '&::before': {
    borderRadius: 8,
    background: 'none',
    width: '1.25rem',
    height: '1.25rem',
  },
});

const CoiRaioRow: React.FC<{
  community: Community;
  disabled: boolean;
  isVisible: boolean;
  isSelected: boolean;
  onToggleVisibility: () => void;
}> = ({community, disabled, isVisible, isSelected, onToggleVisibility}) => {
  return (
    <Flex direction="row" align="center" key={community.id} pb="2">
      <Text size="1" className="mr-2">
        {community.render_order_id}
      </Text>
      <StyledRadioGroupItem
        style={{backgroundColor: community.color}}
        value={String(community.id)}
        disabled={disabled}
        className={disabled ? 'opacity-25' : ''}
      ></StyledRadioGroupItem>
      <Text size="1" className="flex-grow ml-2">
        {community.name}
      </Text>
      <Button size="1" variant="ghost" onClick={onToggleVisibility} disabled={isSelected}>
        {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
      </Button>
    </Flex>
  );
};

export const CoiRadioGroup: React.FC<{
  communities: Community[];
  disabledValues: NullableZone[];
  value?: number;
  defaultValue: number;
}> = ({communities, disabledValues, value, defaultValue}) => {
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
          <CoiRaioRow
            key={community.id}
            community={community}
            disabled={disabledValues.includes(community.id)}
            isVisible={isVisible}
            isSelected={currentlySelectedCommunityId === community.id}
            onToggleVisibility={() => handleToggleVisibility(community.id)}
          />
        );
      })}
    </>
  );
};
