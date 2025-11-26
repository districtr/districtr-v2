import {useMapStore} from '@/app/store/mapStore';
import {Share1Icon} from '@radix-ui/react-icons';
import {IconButton, Popover, Text} from '@radix-ui/themes';
import {useState} from 'react';
import {SaveShareModal} from '../Toolbar/SaveShareModal/SaveShareModal';

export const SharePopoverAndModal = () => {
  const [hovered, setHovered] = useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <Popover.Root open={hovered}>
        <Popover.Trigger>
          <IconButton
            disabled={!mapDocument?.document_id}
            onClick={() => setModalOpen(true)}
            size="1"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            variant="ghost"
          >
            <Share1Icon color={!mapDocument?.document_id ? 'gray' : 'blue'} />
          </IconButton>
        </Popover.Trigger>
        <Popover.Content>
          <Text size="1"> Click to share your map</Text>
        </Popover.Content>
      </Popover.Root>
      <SaveShareModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};
