import {useEffect, useRef} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {NullableZone} from '@/app/constants/types';
import {Community} from '@/app/utils/api/apiHandlers/types';
import {sortCommunitiesByRenderOrder} from '@/app/utils/communities';
import {Box, Flex, RadioGroup, Text, Button} from '@radix-ui/themes';
import {EyeClosedIcon, EyeOpenIcon} from '@radix-ui/react-icons';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {styled} from '@stitches/react';

export type CoiPickerProps = {
  defaultValue: number;
  value?: number;
  onValueChange: (communityId: number, color: string) => void;
  multiple?: false;
  disabledValues?: NullableZone[];
  communityList?: Community[];
};

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

export const CoiPicker = ({
  defaultValue,
  value,
  onValueChange,
  disabledValues,
  communityList,
}: CoiPickerProps) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const stateCommunities = useMapStore(state => state.communities);
  const communities = sortCommunitiesByRenderOrder(communityList ?? stateCommunities);
  const hotkeyRef = useRef<string | null>(null);
  const setCommunityVisibility = useCoiAssignmentsStore(state => state.setCommunityVisibility);
  const communityVisibility = useCoiAssignmentsStore(state => state.communityVisibility);
  const currentlySelectedCommunityId = value ?? defaultValue;

  const handleKeyPressSubmit = () => {
    if (!hotkeyRef.current) return;
    const renderOrderId = parseInt(hotkeyRef.current, 10);
    const selectedCommunity = communities.find(
      community => community.render_order_id === renderOrderId
    );
    hotkeyRef.current = null;
    if (selectedCommunity) {
      onValueChange(selectedCommunity.id, selectedCommunity.color);
    }
  };

  const handleToggleVisibility = (communityId: number) => {
    const prev = communityVisibility.get(communityId) ?? true;
    setCommunityVisibility(communityId, !prev);
  };

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if command/control held down, don't do anything
      if (event.metaKey || event.ctrlKey) return;
      // if key is digit, set selected zone to that digit
      if (!event.code.includes('Digit')) return;
      let value = event.key;
      hotkeyRef.current = value;
      handleKeyPressSubmit();
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [communities, onValueChange]);

  return (
    <Box>
      <RadioGroup.Root
        onValueChange={value => {
          const communityId = Number(value);
          const selectedCommunity = communities.find(community => community.id === communityId);
          if (selectedCommunity) onValueChange(selectedCommunity.id, selectedCommunity.color);
        }}
        value={value !== undefined ? String(value) : undefined}
        defaultValue={String(defaultValue)}
      >
        <Flex direction="column" wrap="wrap" gapX="2">
          {!!mapDocument &&
            communities.map(community => {
              const isVisible = communityVisibility.get(community.id) ?? true;
              return (
                <Flex direction="row" align="center" key={community.id} pb="2">
                  <Text size="1" className="mr-2">
                    {community.render_order_id}
                  </Text>
                  <StyledRadioGroupItem
                    style={{backgroundColor: community.color}}
                    value={String(community.id)}
                    disabled={disabledValues?.includes(community.id)}
                    className={disabledValues?.includes(community.id) ? 'opacity-25' : ''}
                  ></StyledRadioGroupItem>
                  <Text size="1" className="flex-grow ml-2">
                    {community.name}
                  </Text>
                  <Button
                    size="1"
                    variant="ghost"
                    onClick={() => handleToggleVisibility(community.id)}
                    disabled={community.id === currentlySelectedCommunityId}
                  >
                    {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </Button>
                </Flex>
              );
            })}
        </Flex>
      </RadioGroup.Root>
    </Box>
  );
};
