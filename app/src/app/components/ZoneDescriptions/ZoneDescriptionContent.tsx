'use client';
import {Flex, Text, Button, TextArea, IconButton, Box} from '@radix-ui/themes';
import {PlusIcon, Pencil1Icon, Cross2Icon, CheckIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useState} from 'react';
import {getCommunityDisplayNumber} from '@/app/utils/communities';

interface DescriptionEditorProps {
  existingText?: string;
  maxLength: number;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export const DescriptionEditor: React.FC<DescriptionEditorProps> = ({
  existingText,
  maxLength,
  onSave,
  onCancel,
}) => {
  const [text, setText] = useState(existingText || '');
  const commentLengthLimit = useMapStore(state => state.mapDocument?.comment_length_limit);

  // Differentiate "no limit known yet" (null/undefined) from "configured to 0" (admins
  // can set `comment_length_limit = 0` to disable descriptions on a per-map basis).
  // The old `!commentLengthLimit` check collapsed both into a silent render-nothing.
  if (commentLengthLimit == null) {
    return null;
  }
  if (commentLengthLimit === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        Zone descriptions are disabled for this map.
      </div>
    );
  }

  const limitReached = text.length >= maxLength;
  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed) {
      if (trimmed.length > commentLengthLimit) {
        return;
      }
      onSave(trimmed);
    }
  };
  return (
    <Flex direction="column" gap="2" className="p-2 bg-gray-50 rounded-md">
      <Box className="relative size-auto">
        <TextArea
          placeholder="Enter description... (max 240 characters)"
          value={text}
          onChange={e => setText(e.target.value.slice(0, commentLengthLimit))}
          className={limitReached ? '!border-red-500 border-2' : ''}
          size="1"
          rows={7}
          maxLength={maxLength}
        />
        <Box className="absolute bottom-0 right-0 text-right pr-2">
          <Text size="1" color={limitReached ? 'red' : 'gray'}>
            {text.length}/{maxLength}
          </Text>
        </Box>
      </Box>
      <Flex gap="2" justify="end">
        <Button size="1" variant="soft" color="gray" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="1"
          variant="solid"
          onClick={handleSave}
          disabled={!text.trim() || text.trim().length > commentLengthLimit}
        >
          <CheckIcon />
          Save
        </Button>
      </Flex>
    </Flex>
  );
};

interface DescriptionDisplayProps {
  text: string;
  showEditingControls: boolean;
  isCoi: boolean;
  onEdit: () => void;
  onClear: () => void;
}

const DescriptionDisplay: React.FC<DescriptionDisplayProps> = ({
  text,
  showEditingControls,
  isCoi,
  onEdit,
  onClear,
}) => (
  <Flex direction="column" gap="1" className="p-2 bg-gray-50 rounded">
    <Flex justify="between" align="center" gap="1">
      <Text size="1" style={{flex: 1, minWidth: 0}}>
        {text}
      </Text>
      {showEditingControls && (
        <Flex gap="1" style={{flexShrink: 0}} align="center" justify="center">
          <IconButton size="1" variant="ghost" onClick={onEdit}>
            <Pencil1Icon />
          </IconButton>
          {!isCoi && (
            <IconButton size="1" variant="ghost" color="red" onClick={onClear}>
              <Cross2Icon />
            </IconButton>
          )}
        </Flex>
      )}
    </Flex>
  </Flex>
);

export interface ZoneDescriptionContentProps {
  zone: number;
  color: string;
  /** When true, show edit/clear controls */
  showEditingControls?: boolean;
}

export const ZoneDescriptionContent: React.FC<ZoneDescriptionContentProps> = ({
  zone,
  color,
  showEditingControls = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const description = useMapStore(state => state.getZoneDescriptionForZone(zone));
  const setZoneDescription = useMapStore(state => state.setZoneDescription);
  const clearZoneDescription = useMapStore(state => state.clearZoneDescription);
  const commentLengthLimit = useMapStore(state => state.mapDocument?.comment_length_limit);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const communities = useMapStore(state => state.communities);

  if (!commentLengthLimit) {
    return null;
  }

  const zoneLabel = mapMode === 'coi' ? 'Community' : 'District';
  const displayZone = mapMode === 'coi' ? getCommunityDisplayNumber(communities, zone) : zone;

  const handleSaveDescription = (text: string) => {
    setZoneDescription(zone, text);
    setIsEditing(false);
  };

  const handleClearDescription = () => {
    clearZoneDescription(zone);
  };

  return (
    <Flex direction="column" gap="2">
      <Flex align="center" justify="between">
        <Flex align="center" gap="2">
          <Box
            className="w-3 h-3 rounded-full border border-gray-400"
            style={{backgroundColor: color}}
          />
          <Text size="2" weight="bold">
            {zoneLabel} {displayZone} Description
          </Text>
        </Flex>
        {showEditingControls && !isEditing && !description && (
          <IconButton size="1" variant="ghost" onClick={() => setIsEditing(true)}>
            <PlusIcon />
          </IconButton>
        )}
      </Flex>

      {isEditing ? (
        <DescriptionEditor
          existingText={description?.text}
          maxLength={commentLengthLimit}
          onSave={handleSaveDescription}
          onCancel={() => setIsEditing(false)}
        />
      ) : description ? (
        <DescriptionDisplay
          text={description.text}
          showEditingControls={showEditingControls}
          isCoi={mapMode === 'coi'}
          onEdit={() => setIsEditing(true)}
          onClear={handleClearDescription}
        />
      ) : (
        <Text size="1" color="gray" className="py-2 text-center">
          No description yet.
          {showEditingControls && ' Click + to add one.'}
        </Text>
      )}
    </Flex>
  );
};
