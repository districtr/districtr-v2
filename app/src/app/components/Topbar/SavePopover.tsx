import {useState} from 'react';
import {Box, Popover, Button, Flex, Text, IconButton, Inset, Grid} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {CheckIcon, ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {CloudSavedIcon, CloudNotSavedIcon} from './Icons';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

export const SavePopover = () => {
  const [hovered, setHovered] = useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const documentFromIdb = useIdbDocument(mapDocument?.document_id);
  const districtSave = useAssignmentsStore(state => state.handlePutAssignments);
  const districtClientLastUpdated = useAssignmentsStore(state => state.clientLastUpdated);
  const coiSave = useCoiAssignmentsStore(state => state.handlePutAssignments);
  const coiClientLastUpdated = useCoiAssignmentsStore(state => state.clientLastUpdated);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isCommunity = mapDocument?.map_type === MAP_TYPES.COMMUNITY || mapMode === MAP_MODES.COI;
  const activeClientLastUpdated = isCommunity ? coiClientLastUpdated : districtClientLastUpdated;
  const assignmentsOutdated =
    (mapDocument?.updated_at != null &&
      activeClientLastUpdated !== '' &&
      activeClientLastUpdated !== mapDocument.updated_at) ||
    documentFromIdb?.clientLastUpdated !== documentFromIdb?.document_metadata.updated_at;
  const updated = useMapStore(state => Object.values(state.updated).some(Boolean));
  const isOutdated = updated || assignmentsOutdated;
  const handlePutAssignments = isCommunity ? coiSave : districtSave;
  return (
    <Popover.Root open={hovered}>
      <Popover.Trigger>
        <IconButton
          variant="ghost"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => (isOutdated ? handlePutAssignments() : null)}
          className={`cursor-pointer`}
        >
          {isOutdated ? <CloudNotSavedIcon /> : <CloudSavedIcon />}
        </IconButton>
      </Popover.Trigger>
      <Popover.Content width="320px" align="center">
        <Grid columns="60px 1fr" gap="2">
          {isOutdated ? (
            <Inset side="left" className="flex items-center justify-center bg-red-500 mr-4">
              <ExclamationTriangleIcon color="white" className="size-6" />
            </Inset>
          ) : (
            <Inset side="left" className="flex items-center justify-center bg-green-500 mr-4">
              <CheckIcon color="white" className="size-6" />
            </Inset>
          )}
          <Flex direction="column" align="start" justify="center" gapX="3">
            <Box>
              <Text size="1" className="italic">
                Last synced:{' '}
                {new Date(documentFromIdb?.document_metadata.updated_at ?? '').toLocaleString()}
              </Text>
              <br />
              {isOutdated ? (
                <Text size="1" className="italic font-bold">
                  Your changes are saved only to your browser. <br />
                  Click{' '}
                  <Box style={{display: 'inline-block', transform: 'translateY(4px)'}}>
                    <CloudNotSavedIcon />
                  </Box>{' '}
                  to save your changes to the cloud.
                </Text>
              ) : null}
            </Box>
          </Flex>
        </Grid>
      </Popover.Content>
    </Popover.Root>
  );
};
