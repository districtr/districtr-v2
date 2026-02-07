import {Box, Flex, Button, Text, RadioGroup, TextField} from '@radix-ui/themes';
import {MaskOffIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';
import PaintCommunity from '@components/Toolbar/PaintCommunity';
import {useRef} from 'react';
import {ZonePicker} from '@components/Toolbar/ZonePicker';

const CommunityRadioGroupItem = ({
  id,
  name,
  color,
  isReadOnly,
}: {
  id: number;
  name: string;
  color: string;
  isReadOnly: boolean;
}) => {
  const setCommunityName = useMapControlsStore(state => state.setCommunityName);
  const setCommunityColor = useMapControlsStore(state => state.setCommunityColor);
  const selectedCommunity = useMapControlsStore(state => state.selectedCommunityId);

  return (
    <Flex key={id} align="center" gap="2">
      <Text as="label" size="1" className="flex-grow">
        <Flex direction="row" align="center" gap="2">
          <RadioGroup.Item
            value={String(id)}
            disabled={isReadOnly}
            style={{
              width: 16,
              height: 16,
              borderRadius: '9999px',
              border: `1px solid {color}`,
            }}
          />
          <TextField.Root
            value={name}
            onChange={e => setCommunityName({communityId: id, newName: e.target.value})}
            size="1"
            className="flex-grow"
            disabled={isReadOnly}
            maxLength={40}
          />
          <Box>
            <input
              aria-label={`Color for ${name}`}
              type="color"
              value={color}
              onChange={e => setCommunityColor(id, e.target.value)}
              disabled={isReadOnly}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid #D1D5DB',
                padding: 0,
                background: 'transparent',
                // opacity: community.opacity * communityOpacity,
              }}
            />
          </Box>
        </Flex>
      </Text>
    </Flex>
  );
};

const CommunityRadioFormList = ({
  isReadOnly,
  selectedCommunityId,
}: {
  isReadOnly: boolean;
  selectedCommunityId: number;
}) => {
  const communityList = useMapControlsStore(state => state.communityList);
  const setSelectedCommunityId = useMapControlsStore(state => state.setSelectedCommunityId);

  return (
    <RadioGroup.Root
      value={String(selectedCommunityId)}
      onValueChange={value => setSelectedCommunityId(Number(value))}
    >
      <Flex direction="column" gap="2">
        {communityList
          .sort((a, b) => a.displayPosition - b.displayPosition)
          .map(community => (
            <CommunityRadioGroupItem
              key={community.id}
              id={community.id}
              name={community.name}
              color={community.color}
              isReadOnly={isReadOnly}
            />
          ))}
      </Flex>
    </RadioGroup.Root>
  );
};

export const CommunityControls = ({mode}: {mode: 'brush' | 'erase'}) => {
  const addCommunity = useMapControlsStore(state => state.addCommunity);
  const removeCommunities = useMapControlsStore(state => state.removeCommunities);
  const selectedCommunityId = useMapControlsStore(state => state.selectedCommunityId);
  const access = useMapStore(state => state.mapStatus?.access);
  const isReadOnly = access === 'read';

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap">
        <Text size="1">
          {mode === 'brush' ? 'Community Paint Mode Woo' : 'Community Erase Mode'}
        </Text>
      </Flex>
      {mode === 'brush' ? (
        <CommunityRadioFormList isReadOnly={isReadOnly} selectedCommunityId={selectedCommunityId} />
      ) : null}
      {mode === 'brush' ? (
        <Flex direction="row" gap="2" wrap="wrap">
          <Button size="1" variant="soft" onClick={addCommunity} disabled={isReadOnly}>
            Add Community
          </Button>
          <Button
            size="1"
            variant="soft"
            color="red"
            onClick={() => {
              removeCommunities([selectedCommunityId]);
            }}
            disabled={isReadOnly}
          >
            Remove Community
          </Button>
        </Flex>
      ) : null}

      {mode === 'erase' ? (
        <Flex direction="row" gap="2" wrap="wrap">
          <Button
            size="1"
            variant="soft"
            color="red"
            onClick={() => {
              removeCommunities([selectedCommunityId]);
            }}
            disabled={isReadOnly}
          >
            Remove Community
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
};
