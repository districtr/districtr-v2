import {useEffect, useRef} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {NullableZone} from '@/app/constants/types';
import type {Community} from '@/app/utils/api/apiHandlers/types';
import {sortCommunitiesByRenderOrder} from '@/app/utils/communities';
import {Box, Flex, RadioGroup} from '@radix-ui/themes';
import {CoiRadioGroup} from '@/app/components/Toolbar/CoiRadioGroup';

export type CoiPickerProps = {
  defaultValue: number;
  value?: number;
  onValueChange: (communityId: number, color: string) => void;
  multiple?: false;
  disabledValues?: NullableZone[];
  communityList?: Community[];
  isReadOnly?: boolean;
  canRemove?: boolean;
  availableColors?: string[];
  communityNameLengthLimit?: number;
  onRemoveCommunity?: (communityId: number) => void;
  onUpdateCommunity?: (
    communityId: number,
    updates: {name?: string; description?: string; color?: string}
  ) => void;
};

export const CoiPicker = ({
  defaultValue,
  value,
  onValueChange,
  disabledValues,
  communityList,
  isReadOnly,
  canRemove,
  availableColors,
  communityNameLengthLimit,
  onRemoveCommunity,
  onUpdateCommunity,
}: CoiPickerProps) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const stateCommunities = useMapStore(state => state.communities);
  const communities = sortCommunitiesByRenderOrder(communityList ?? stateCommunities);
  const hotkeyRef = useRef<string | null>(null);

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
    <Box maxWidth={'100%'} id="BOX_CONTAINER">
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
          {!!mapDocument && (
            <CoiRadioGroup
              communities={communities}
              disabledValues={disabledValues ?? []}
              value={value}
              defaultValue={defaultValue}
              isReadOnly={isReadOnly}
              canRemove={canRemove}
              availableColors={availableColors}
              communityNameLengthLimit={communityNameLengthLimit}
              onRemoveCommunity={onRemoveCommunity}
              onUpdateCommunity={onUpdateCommunity}
            />
          )}
        </Flex>
      </RadioGroup.Root>
    </Box>
  );
};
