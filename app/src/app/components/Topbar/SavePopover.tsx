import {useState} from 'react';
import {Box, Popover, Button, Flex, Text, IconButton} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {ExclamationTriangleIcon, SymbolIcon} from '@radix-ui/react-icons';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

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
        >
          {isOutdated ? <SymbolIcon color="red" /> : <SymbolIcon color="blue" />}
        </IconButton>
      </Popover.Trigger>
      <Popover.Content maxWidth="360px">
        <Flex direction="column" align="center" gapX="3">
          <Text size="1" className="italic">
            Last synced:{' '}
            {new Date(documentFromIdb?.document_metadata.updated_at ?? '').toLocaleString()}
          </Text>
          {isOutdated ? (
            <Text size="1" className="italic">
              Your changes are saved only to your browser
              
              Click to sync your map
            </Text>
          ) : null}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};
