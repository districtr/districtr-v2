import {useState} from 'react';
import {Box, Popover, Button, Flex, Text, IconButton, Inset, Grid} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {CheckIcon, ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {CloudSavedIcon, CloudNotSavedIcon} from './Icons';

export const SavePopover = () => {
  const [hovered, setHovered] = useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const documentFromIdb = useIdbDocument(mapDocument?.document_id);
  const isOutdated =
    documentFromIdb?.clientLastUpdated !== documentFromIdb?.document_metadata.updated_at;
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);
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
